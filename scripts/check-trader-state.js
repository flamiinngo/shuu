const { Connection, PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");

const conn = new Connection(
  process.env.RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);
const PID = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const idl = JSON.parse(fs.readFileSync("target/idl/shuu.json"));
const provider = new anchor.AnchorProvider(
  conn,
  {
    publicKey: anchor.web3.Keypair.generate().publicKey,
    signTransaction: async (t) => t,
    signAllTransactions: async (t) => t,
  },
  {}
);
const program = new anchor.Program(idl, provider);
const trader = new PublicKey("E1E34BjHrobYEDz1qRwNrwnfE7zCmCLpQSYMG8UvKECM");

(async () => {
  const a = await program.account.traderAccount.fetch(trader);
  console.log("=== ON-CHAIN STATE ===");
  console.log("  is_open:           ", a.isOpen);
  console.log("  is_settled:        ", a.isSettled);
  console.log("  is_liquidated:     ", a.isLiquidated);
  console.log("  usdc_balance:      ", a.usdcBalance.toNumber() / 1e6, "sUSDC");
  console.log("  locked_collateral: ", a.lockedCollateral.toNumber() / 1e6, "sUSDC");

  console.log("\n=== RECENT TXS ON TRADER ACCOUNT ===");
  const sigs = await conn.getSignaturesForAddress(trader, { limit: 10 });
  for (const s of sigs) {
    const status = s.err ? "FAIL" : "OK  ";
    const when = s.blockTime ? new Date(s.blockTime * 1000).toISOString() : "?";
    console.log(status, s.signature, when);
  }
})().catch((e) => console.error(e.message));
