const { Connection, PublicKey } = require("@solana/web3.js");

const conn = new Connection(
  process.env.RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);
const PROG = new PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const WALLET = new PublicKey("4wKWJDiKtuvVii1cDypDw6BwNz5AZc97febgBuq6A79G");

(async () => {
  const [mint] = PublicKey.findProgramAddressSync([Buffer.from("usdc_mint")], PROG);
  const [ata] = PublicKey.findProgramAddressSync(
    [WALLET.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()],
    ATA_PROG
  );
  const [trader] = PublicKey.findProgramAddressSync(
    [Buffer.from("trader"), WALLET.toBuffer()],
    PROG
  );

  console.log("mint:  ", mint.toBase58());
  console.log("ata:   ", ata.toBase58());
  console.log("trader:", trader.toBase58());

  const info = await conn.getParsedAccountInfo(ata);
  if (info.value === null) {
    console.log("-> ATA does NOT exist (mint never reached chain)");
  } else {
    const amt = info.value.data && info.value.data.parsed && info.value.data.parsed.info && info.value.data.parsed.info.tokenAmount;
    console.log("sUSDC balance (wallet):", amt ? amt.uiAmount : "?");
  }

  const sigs = await conn.getSignaturesForAddress(WALLET, { limit: 8 });
  console.log("\nLast 8 txs on wallet:");
  for (const s of sigs) {
    const status = s.err ? "FAIL" : "OK  ";
    const when = s.blockTime ? new Date(s.blockTime * 1000).toISOString() : "?";
    console.log(status, s.signature, when);
  }
})().catch((e) => console.error(e.message));
