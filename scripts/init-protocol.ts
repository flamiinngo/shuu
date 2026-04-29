import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const IDL  = JSON.parse(readFileSync(join(__dirname, "../target/idl/shuu.json"), "utf8"));
const RPC  = "https://api.devnet.solana.com";

const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const PROGRAM_ID       = new anchor.web3.PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

async function main() {
  const keypairPath = join(homedir(), ".config/solana/id.json");
  const raw         = JSON.parse(readFileSync(keypairPath, "utf8"));
  const payer       = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const wallet     = new anchor.Wallet(payer);
  const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const program = new anchor.Program(IDL as anchor.Idl, provider);

  const [protocol] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("protocol")],  PROGRAM_ID);
  const [mint]     = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("usdc_mint")], PROGRAM_ID);
  const [vault]    = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault")],     PROGRAM_ID);

  // Check if already initialized
  const existing = await connection.getAccountInfo(protocol);
  if (existing) {
    console.log("Protocol already initialized at", protocol.toBase58());
    return;
  }

  console.log("Initializing protocol...");
  console.log("  protocol_state:", protocol.toBase58());
  console.log("  usdc_mint:     ", mint.toBase58());
  console.log("  vault:         ", vault.toBase58());

  const sig = await (program.methods as any)
    .initialize()
    .accounts({
      payer:         payer.publicKey,
      protocolState: protocol,
      usdcMint:      mint,
      vault:         vault,
      tokenProgram:  TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Protocol initialized. Tx:", sig);
  console.log("Vault seeded with 1,000,000 sUSDC for liquidity.");
}

main().catch(console.error);
