/**
 * One-time script: initialize comp def accounts for the v2 circuits.
 * Run this after every deploy that introduces new circuit names.
 *   npx ts-node scripts/init-comp-defs.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getLookupTableAddress,
  getArciumProgram,
} from "@arcium-hq/client";
import { sha256 } from "@noble/hashes/sha256";

const IDL        = JSON.parse(readFileSync(join(__dirname, "../target/idl/shuu.json"), "utf8"));
const PROGRAM_ID = new anchor.web3.PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const RPC        = "https://api.devnet.solana.com";

function compDefPda(circuitName: string): anchor.web3.PublicKey {
  const hash = sha256(new TextEncoder().encode(circuitName));
  const num  = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, true);
  return getCompDefAccAddress(PROGRAM_ID, num);
}

async function main() {
  const keypairPath = join(homedir(), ".config/solana/id.json");
  const raw         = JSON.parse(readFileSync(keypairPath, "utf8"));
  const payer       = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const wallet     = new anchor.Wallet(payer);
  const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program    = new anchor.Program(IDL as anchor.Idl, provider);

  const arciumProg = getArciumProgram(provider);
  const mxeAddr    = getMXEAccAddress(PROGRAM_ID);
  const mxeAcc     = await (arciumProg.account as any).mxeAccount.fetch(mxeAddr);
  const lutAddr    = getLookupTableAddress(PROGRAM_ID, mxeAcc.lutOffsetSlot);

  console.log("payer:        ", payer.publicKey.toBase58());
  console.log("mxe_account:  ", mxeAddr.toBase58());
  console.log("lut:          ", lutAddr.toBase58());
  console.log();

  const circuits = [
    { name: "store_position_v5",    ix: "initStorePositionCompDef"    },
    { name: "check_liquidation_v5", ix: "initCheckLiquidationCompDef" },
    { name: "compute_pnl_v5",       ix: "initComputePnlCompDef"       },
  ] as const;

  for (const { name, ix } of circuits) {
    const compDefAddr = compDefPda(name);
    const existing    = await connection.getAccountInfo(compDefAddr);

    if (existing) {
      console.log(`✓ ${name} already initialized at ${compDefAddr.toBase58()}`);
      continue;
    }

    console.log(`  initializing ${name}…`);
    console.log(`  comp_def: ${compDefAddr.toBase58()}`);

    const sig = await (program.methods as any)
      [ix]()
      .accounts({
        payer:               payer.publicKey,
        mxeAccount:          mxeAddr,
        compDefAccount:      compDefAddr,
        addressLookupTable:  lutAddr,
      })
      .rpc();

    console.log(`✓ ${name} initialized  tx: ${sig}`);
    console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    console.log();
  }

  console.log("Done.");
}

main().catch((err: any) => {
  console.error("FATAL:", err?.message ?? err);
  if (err?.logs) (err.logs as string[]).forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
