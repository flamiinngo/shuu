/**
 * Diagnose why test-e2e's PnL polling can't find the event.
 * Shows: trader account state + recent txs + actual log content of any
 * tx that mentions "ComputePnl" so we can see whether the event is there
 * and what it looks like.
 */
const { Connection, PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const PID = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const TRADER_PDA = new PublicKey("5xpgdC2PAF8EEr4JwV5LzdtDkyPdDmyZN8EP9B6HWmh9");
const COMPUTE_PNL_TX = "5qhChmTz3pHpa5V7sBC71hazhbspm87LKkaPQXNFmGSToLhgTxvvTvrNwN6pEcGZwKbSdNTSA6nsfYznsHzGVYts";

(async () => {
  const conn = new Connection(RPC, "confirmed");
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

  // 1. Trader account state
  const a = await program.account.traderAccount.fetch(TRADER_PDA);
  console.log("=== TRADER STATE ===");
  console.log("  is_open:           ", a.isOpen);
  console.log("  is_settled:        ", a.isSettled);
  console.log("  is_liquidated:     ", a.isLiquidated);
  console.log("  usdc_balance:      ", a.usdcBalance.toNumber() / 1e6);
  console.log("  locked_collateral: ", a.lockedCollateral.toNumber() / 1e6);

  // 2. Recent txs
  console.log("\n=== RECENT TXS ON TRADER ACCOUNT ===");
  const sigs = await conn.getSignaturesForAddress(TRADER_PDA, { limit: 12 });
  for (const s of sigs) {
    console.log(s.err ? "FAIL" : "OK  ", s.signature, new Date(s.blockTime * 1000).toISOString());
  }

  // 3. Find any tx that mentions ComputePnl in logs
  console.log("\n=== SEARCHING RECENT TXS FOR ComputePnl ===");
  let found = false;
  for (const s of sigs.slice(0, 8)) {
    const tx = await conn.getTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    const logs = tx?.meta?.logMessages || [];
    const hasIt = logs.some((l) => l.includes("ComputePnl"));
    if (!hasIt) continue;
    found = true;
    console.log("\n--- TX:", s.signature, s.err ? "(FAILED)" : "(OK)");
    logs.forEach((l) => console.log("  ", l));
  }
  if (!found) {
    console.log("No tx with 'ComputePnl' in logs found in last 8 txs.");
  }

  // 4. Original compute_pnl tx logs (sanity check)
  console.log("\n=== COMPUTE_PNL TX LOGS (the one we sent) ===");
  const orig = await conn.getTransaction(COMPUTE_PNL_TX, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!orig) {
    console.log("(not found)");
  } else {
    (orig.meta?.logMessages || []).forEach((l) => console.log(" ", l));
  }
})().catch((e) => console.error("ERR:", e.message));
