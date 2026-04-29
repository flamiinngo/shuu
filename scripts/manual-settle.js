/**
 * Manually settle a stuck position (is_open=false, is_settled=false).
 * Settles with magnitude=0, is_profit=false → returns the locked collateral
 * unchanged. Use this when the frontend's PnL polling errored out before
 * calling settle, leaving funds stuck.
 *
 * Run with the WALLET that owns the position:
 *   node scripts/manual-settle.js
 *
 * Defaults to ~/.config/solana/id.json. Override via KEYPAIR_PATH env.
 */
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RPC = process.env.RPC_URL ||
  "https://api.devnet.solana.com";
const KEYPAIR = process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config/solana/id.json");

const PID = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, "utf8")))
  );
  const provider = new anchor.AnchorProvider(
    conn,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  const idl = JSON.parse(fs.readFileSync("target/idl/shuu.json"));
  const program = new anchor.Program(idl, provider);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trader"), payer.publicKey.toBuffer()],
    PID
  );

  const before = await program.account.traderAccount.fetch(pda);
  console.log("BEFORE:");
  console.log("  is_open:           ", before.isOpen);
  console.log("  is_settled:        ", before.isSettled);
  console.log("  usdc_balance:      ", before.usdcBalance.toNumber() / 1e6);
  console.log("  locked_collateral: ", before.lockedCollateral.toNumber() / 1e6);

  if (before.isOpen) {
    console.error("Cannot settle while position is still marked open.");
    process.exit(1);
  }
  if (before.isSettled) {
    console.error("Already settled. Nothing to do.");
    process.exit(1);
  }

  console.log("\nSettling with magnitude=0 (no PnL credited)…");
  const sig = await program.methods
    .settlePosition(new anchor.BN(0), false)
    .accounts({ payer: payer.publicKey, traderAcc: pda })
    .rpc();
  console.log("settle tx:", sig);

  const after = await program.account.traderAccount.fetch(pda);
  console.log("\nAFTER:");
  console.log("  is_open:           ", after.isOpen);
  console.log("  is_settled:        ", after.isSettled);
  console.log("  usdc_balance:      ", after.usdcBalance.toNumber() / 1e6);
  console.log("  locked_collateral: ", after.lockedCollateral.toNumber() / 1e6);
})().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.logs) e.logs.forEach((l) => console.error(" ", l));
  process.exit(1);
});
