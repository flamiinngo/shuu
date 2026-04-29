import { uploadCircuit, ARCIUM_IDL } from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const PROGRAM_ID = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

const kp       = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`)))
);
// Public devnet RPC rate-limits aggressively; use RPC_URL env var to override with Helius/QuickNode/etc.
const RPC_URL  = process.env.RPC_URL || "https://api.devnet.solana.com";
console.log("RPC:", RPC_URL.replace(/api-key=[^&]+/, "api-key=***"));
const conn     = new Connection(RPC_URL, "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const circuits = ["store_position_v5", "check_liquidation_v5", "compute_pnl_v5"];

// Helius free tier rate-limits at ~10 RPS. Smaller chunkSize = fewer parallel txs per batch.
// 15 worked reliably with Helius free tier in coinflip test. Lower if 429s overwhelm; raise if you have paid RPC.
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "15", 10);
console.log("CHUNK_SIZE:", CHUNK_SIZE);

for (const name of circuits) {
  const arcis = readFileSync(resolve(__dirname, `../build/${name}.arcis`));
  console.log(`\n=== Uploading ${name} (${arcis.byteLength} bytes) ===`);

  let attempt = 0;
  const MAX_ATTEMPTS = 5;
  while (true) {
    attempt++;
    try {
      await uploadCircuit(provider, name, PROGRAM_ID, new Uint8Array(arcis), true, CHUNK_SIZE, { commitment: "confirmed" });
      console.log(`${name} uploaded on attempt ${attempt}.`);
      break;
    } catch (err) {
      console.error(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt >= MAX_ATTEMPTS) throw err;
      const wait = 5000 * attempt;
      console.log(`Waiting ${wait}ms before retry…`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}
