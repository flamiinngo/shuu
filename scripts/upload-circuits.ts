/**
 * Directly upload v2 circuit binaries to the Arcium MXE.
 * Run after init-comp-defs.ts when arcium deploy --resume skips circuit upload.
 *   npx ts-node scripts/upload-circuits.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  getMXEAccAddress,
  getArciumProgram,
  uploadCircuit,
  getCircuitState,
  getCompDefAccAddress,
} from "@arcium-hq/client";
import { sha256 } from "@noble/hashes/sha256";

const PROGRAM_ID = new anchor.web3.PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const RPC        = "https://api.devnet.solana.com";
const BUILD_DIR  = join(__dirname, "../build");

const CIRCUITS = [
  "store_position_v5",
  "check_liquidation_v5",
  "compute_pnl_v5",
] as const;

function compDefAddr(name: string) {
  const hash = sha256(new TextEncoder().encode(name));
  const num  = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, true);
  return getCompDefAccAddress(PROGRAM_ID, num);
}

async function main() {
  const raw    = JSON.parse(readFileSync(join(homedir(), ".config/solana/id.json"), "utf8"));
  const payer  = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
  const conn   = new anchor.web3.Connection(RPC, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const arciumProg = getArciumProgram(provider);

  console.log("payer:", payer.publicKey.toBase58());

  for (const name of CIRCUITS) {
    const addr = compDefAddr(name);
    const acc  = await (arciumProg.account as any).computationDefinitionAccount.fetch(addr);
    const state = getCircuitState(acc.circuitSource as any);
    console.log(`\n${name}`);
    console.log(`  comp_def: ${addr.toBase58()}`);
    console.log(`  state:    ${state}`);

    if (state === "OnchainFinalized") {
      console.log(`  ⚠ already finalized — but checking if circuit content is correct`);
      console.log(`  expected size: ${acc.definition?.circuitLen ?? '?'}`);
      const arcisLocal = readFileSync(join(BUILD_DIR, `${name}.arcis`));
      console.log(`  local .arcis size: ${arcisLocal.length}`);
      if (acc.definition?.circuitLen?.toString() !== String(arcisLocal.length)) {
        console.log(`  ✗ SIZE MISMATCH — comp def has wrong circuit. Need to redeploy with new circuit names (e.g. _v5)`);
      } else {
        console.log(`  ✓ size matches — leaving alone`);
      }
      continue;
    }

    if (state === "Offchain") {
      console.log(`  ✗ state is Offchain — comp def needs re-init before upload`);
      console.log(`    run: npx ts-node scripts/init-comp-defs.ts  then retry`);
      process.exit(1);
    }

    // OnchainPending — upload the binary (USE .arcis NOT .idarc!)
    const arcis = readFileSync(join(BUILD_DIR, `${name}.arcis`));
    console.log(`  uploading ${arcis.length} bytes…`);
    const sigs = await uploadCircuit(
      provider,
      name,
      PROGRAM_ID,
      new Uint8Array(arcis),
      true,
      500,
      { commitment: "confirmed" },
    );
    console.log(`  ✓ uploaded + finalized  (${sigs.length} txs)`);
    if (sigs.length > 0) {
      console.log(`  last tx: https://explorer.solana.com/tx/${sigs[sigs.length - 1]}?cluster=devnet`);
    }
  }

  console.log("\nDone. Run the e2e test now:");
  console.log("  npx ts-node scripts/test-e2e.ts");
}

main().catch((err: any) => {
  console.error("FATAL:", err?.message ?? err);
  if (err?.logs) (err.logs as string[]).forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
