/**
 * Diagnose why store_position_v5 computations are failing.
 * Runs open_position, waits for finalization, then checks:
 *   - computation execution status (Success vs Failure)
 *   - whether the callback tx appeared
 * Usage: npx ts-node scripts/diagnose.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getClusterAccAddress,
  getArciumProgram,
} from "@arcium-hq/client";
import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";

const IDL        = JSON.parse(readFileSync(join(__dirname, "../target/idl/shuu.json"), "utf8"));
const PROGRAM_ID = new anchor.web3.PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const RPC        = "https://api.devnet.solana.com";

// RescueCipher minimal impl (same key derivation as @arcium-hq/client)
const { RescueCipher } = require("@arcium-hq/client");

function getPdas() {
  return {
    protocol: anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("protocol")],  PROGRAM_ID)[0],
    mint:     anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("usdc_mint")], PROGRAM_ID)[0],
    vault:    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault")],     PROGRAM_ID)[0],
  };
}
function traderPda(user: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("trader"), user.toBuffer()], PROGRAM_ID
  )[0];
}
function nonceToU128(b: Uint8Array): anchor.BN {
  return new anchor.BN(Buffer.from(b).reverse().toString("hex"), 16);
}
function toFixed6(n: number): bigint { return BigInt(Math.round(n * 1_000_000)); }

async function main() {
  const walletPath = join(__dirname, "test-wallet.json");
  const raw  = JSON.parse(readFileSync(walletPath, "utf8"));
  const payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const wallet     = new anchor.Wallet(payer);
  const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program    = new anchor.Program(IDL as anchor.Idl, provider);
  const arciumProg = getArciumProgram(provider);

  const mxeAddr  = getMXEAccAddress(PROGRAM_ID);
  const mxeAcc   = await (arciumProg.account as any).mxeAccount.fetch(mxeAddr);
  const cluster  = mxeAcc.cluster as number;
  console.log("cluster:", cluster, " payer:", payer.publicKey.toBase58());

  const mxePubkey = await getMXEPublicKey(provider, PROGRAM_ID);
  if (!mxePubkey) throw new Error("No MXE pubkey");

  const priv   = x25519.utils.randomSecretKey();
  const pub    = x25519.getPublicKey(priv);
  const secret = x25519.getSharedSecret(priv, mxePubkey);
  const cipher = new RescueCipher(secret);
  const nonce  = new Uint8Array(16);
  (globalThis as any).crypto.getRandomValues(nonce);

  const cts = cipher.encrypt([
    toFixed6(500),    // collateral
    toFixed6(67000),  // entry_price
    toFixed6(0.074627), // size
    1n,               // is_long
  ], nonce);

  const offset   = new anchor.BN(Date.now().toString());
  const compAccAddr = getComputationAccAddress(cluster, offset);

  // Build accounts
  const hash       = sha256(new TextEncoder().encode("store_position_v5"));
  const compDefNum = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, true);

  const accounts = {
    mxeAccount:         mxeAddr,
    mempoolAccount:     getMempoolAccAddress(cluster),
    executingPool:      getExecutingPoolAccAddress(cluster),
    computationAccount: compAccAddr,
    compDefAccount:     getCompDefAccAddress(PROGRAM_ID, compDefNum),
    clusterAccount:     getClusterAccAddress(cluster),
  };

  const pda = traderPda(payer.publicKey);
  console.log("trader PDA:", pda.toBase58());
  console.log("computation account:", compAccAddr.toBase58());
  console.log();

  // Send open_position
  console.log("Sending open_position…");
  const sig = await (program.methods as any)
    .openPosition(
      offset,
      Array.from(cts[0]), Array.from(cts[1]), Array.from(cts[2]), Array.from(cts[3]),
      Array.from(pub),
      nonceToU128(nonce),
      new anchor.BN(500 * 1_000_000),
    )
    .accounts({ traderAcc: pda, ...accounts })
    .rpc();
  console.log("tx:", sig);

  // Poll computation account until finalized
  console.log("Waiting for computation to finalize…");
  let compAcc: any = null;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2000));
    compAcc = await (arciumProg.account as any).computationAccount.fetchNullable(compAccAddr);
    if (compAcc !== null) {
      const statusKeys = Object.keys(compAcc.status);
      process.stdout.write(`\rstatus: ${statusKeys[0]}  `);
      if ('finalized' in compAcc.status) break;
    }
  }
  console.log();

  if (!compAcc || !('finalized' in compAcc.status)) {
    console.log("Computation never finalized after 4 minutes");
    return;
  }

  // Show full finalized status
  console.log("Finalized status:", JSON.stringify(compAcc.status, null, 2));

  // Check if execution succeeded
  const fin = compAcc.status.finalized;
  const execStatus = fin?.executionStatus ?? fin?.execution_status;
  console.log("\nexecution_status:", JSON.stringify(execStatus, null, 2));

  // Wait a bit and check for callback
  console.log("\nWaiting 15s for callback tx…");
  await new Promise(r => setTimeout(r, 15000));
  const traderAcc = await (program.account as any).traderAccount.fetch(pda);
  console.log("is_open after wait:", traderAcc.isOpen);

  // Show recent transactions on trader account
  const sigs = await connection.getSignaturesForAddress(pda, { limit: 5 });
  console.log("\nRecent txs on trader account:");
  for (const s of sigs) {
    console.log(`  ${s.err ? "FAILED" : "OK    "} ${s.signature}  ${new Date(s.blockTime! * 1000).toISOString()}`);
  }
}

main().catch((err: any) => {
  console.error("FATAL:", err?.message ?? err);
  if (err?.logs) (err.logs as string[]).forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
