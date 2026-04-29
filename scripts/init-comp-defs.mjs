import {
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getArciumProgramId,
  ARCIUM_IDL,
} from "@arcium-hq/client";
import * as anchor from "@coral-xyz/anchor";
import { AddressLookupTableProgram, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require  = createRequire(import.meta.url);

const PROGRAM_ID = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

const kp       = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`)))
);
const conn     = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet   = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl     = require(resolve(__dirname, "../target/idl/shuu.json"));
const program = new anchor.Program(idl, provider);

const arciumProgram  = new anchor.Program(ARCIUM_IDL, provider);
const mxeAccAddress  = getMXEAccAddress(PROGRAM_ID);

// Fetch MXE account to get the LUT offset slot.
const mxeData  = await arciumProgram.account.mxeAccount.fetch(mxeAccAddress);
const lutOffset = mxeData.lutOffsetSlot;
const lutAddress = getLookupTableAddress(PROGRAM_ID, lutOffset);

const circuits = [
  { name: "store_position_v5",    method: "initStorePositionCompDef" },
  { name: "check_liquidation_v5", method: "initCheckLiquidationCompDef" },
  { name: "compute_pnl_v5",       method: "initComputePnlCompDef" },
];

for (const { name, method } of circuits) {
  const offsetBytes    = getCompDefAccOffset(name);
  const offsetNum      = Buffer.from(offsetBytes).readUInt32LE(0);
  const compDefAddress = getCompDefAccAddress(PROGRAM_ID, offsetNum);

  const sig = await program.methods[method]()
    .accounts({
      payer:               kp.publicKey,
      mxeAccount:          mxeAccAddress,
      compDefAccount:      compDefAddress,
      addressLookupTable:  lutAddress,
      lutProgram:          AddressLookupTableProgram.programId,
      arciumProgram:       getArciumProgramId(),
      systemProgram:       anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(`${name} comp def initialized — ${sig}`);
}
