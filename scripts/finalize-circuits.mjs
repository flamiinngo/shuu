import {
  buildFinalizeCompDefTx,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";

const PROGRAM_ID = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

const kp       = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`)))
);
const conn     = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const circuits = ["store_position_v5", "check_liquidation_v5", "compute_pnl_v5"];

for (const name of circuits) {
  const offsetBytes = getCompDefAccOffset(name);
  const offsetNum   = Buffer.from(offsetBytes).readUInt32LE(0);

  const tx  = await buildFinalizeCompDefTx(provider, offsetNum, PROGRAM_ID);
  const sig = await provider.sendAndConfirm(tx);
  console.log(`${name} finalized — ${sig}`);
}
