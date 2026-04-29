import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { Shuu } from "../target/types/shuu";
import {
  getMXEPublicKeyWithRetry,
  awaitComputationFinalization,
  RescueCipher,
} from "@arcium-hq/client";
import { x25519 } from "@noble/curves/ed25519";
import { randomBytes } from "crypto";
import { assert } from "chai";

// ─── helpers ──────────────────────────────────────────────────────────────────

// 16-byte nonce → little-endian u128 as BN (matches Borsh serialisation).
function nonceToU128(b: Uint8Array): anchor.BN {
  return new anchor.BN(Buffer.from(b).reverse().toString("hex"), 16);
}

// Fresh ephemeral keypair + shared secret with the MXE.
function makeClientKeys(mxePubkey: Uint8Array) {
  const priv   = x25519.utils.randomSecretKey();
  const pub    = x25519.getPublicKey(priv);
  const secret = x25519.getSharedSecret(priv, mxePubkey);
  return { priv, pub, secret };
}

// Waits for an on-chain event with a 90 s timeout.
function awaitEvent<T>(
  program: Program<Shuu>,
  name:    string,
  ms = 90_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${name}`)), ms);
    const id = program.addEventListener(name, (ev) => {
      clearTimeout(t);
      program.removeEventListener(id);
      resolve(ev as T);
    });
  });
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe("shuu", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Shuu as Program<Shuu>;
  const wallet  = provider.wallet as anchor.Wallet;

  let mxePubkey: Uint8Array;

  before(async () => {
    mxePubkey = await getMXEPublicKeyWithRetry(provider, program.programId);
  });

  // ─── one-time setup ──────────────────────────────────────────────────────

  it("registers computation definitions", async () => {
    await program.methods.initStorePositionCompDef().rpc();
    await program.methods.initCheckLiquidationCompDef().rpc();
    await program.methods.initComputePnlCompDef().rpc();
  });

  // ─── open position ───────────────────────────────────────────────────────

  it("opens a long BTC position — plaintext never hits the chain", async () => {
    const { pub, secret } = makeClientKeys(mxePubkey);
    const cipher          = new RescueCipher(secret);
    const nonce           = randomBytes(16);

    // $50k entry, 0.1 BTC, 1 SOL collateral, long
    // All values scaled by 1e6 for fixed-point arithmetic in the circuit.
    const cts = cipher.encrypt(
      [1_000_000n, 50_000_000_000n, 100_000n, 1n],
      nonce
    );
    // cts[0] = collateral, [1] = entry_price, [2] = size, [3] = is_long

    const offset = new anchor.BN(Date.now().toString());

    const [traderAcc] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), wallet.publicKey.toBuffer()],
      program.programId
    );

    const openedEv = awaitEvent<{ trader: anchor.web3.PublicKey }>(program, "PositionOpenedEvent");

    await program.methods
      .openPosition(
        offset,
        cts[0], cts[1], cts[2], cts[3],
        Array.from(pub),
        nonceToU128(nonce)
      )
      .accounts({ traderAcc })
      .rpc();

    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");

    const ev  = await openedEv;
    const acc = await program.account.traderAccount.fetch(traderAcc);

    assert.ok(ev.trader.equals(wallet.publicKey));
    assert.isTrue(acc.isOpen);
    assert.isFalse(acc.isLiquidated);
  });

  // ─── healthy position is not liquidated ─────────────────────────────────

  it("passes liquidation check when position is healthy", async () => {
    const { pub, secret } = makeClientKeys(mxePubkey);
    const cipher          = new RescueCipher(secret);
    const nonce           = randomBytes(16);

    // Price dropped 2% — well above 5% maintenance margin
    const cts = cipher.encrypt([49_000_000_000n, 500n], nonce);
    // cts[0] = mark_price ($49k), cts[1] = maint_margin_bps (500 = 5%)

    const offset = new anchor.BN((Date.now() + 1).toString());

    const [traderAcc] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), wallet.publicKey.toBuffer()],
      program.programId
    );

    const checkedEv = awaitEvent<{ trader: anchor.web3.PublicKey; wasLiquidated: boolean }>(
      program, "LiquidationCheckedEvent"
    );

    await program.methods
      .checkLiquidation(
        offset,
        cts[0], cts[1],
        Array.from(pub),
        nonceToU128(nonce)
      )
      .accounts({ trader: wallet.publicKey, traderAcc })
      .rpc();

    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");

    const ev = await checkedEv;
    assert.isFalse(ev.wasLiquidated, "a 2% drop should not trigger liquidation at 5% maintenance");
  });

  // ─── underwater position gets liquidated ─────────────────────────────────

  it("liquidates a position that breaches maintenance margin", async () => {
    // First re-open with a very leveraged position (tiny collateral, large size)
    const openKeys   = makeClientKeys(mxePubkey);
    const openCipher = new RescueCipher(openKeys.secret);
    const openNonce  = randomBytes(16);

    const openCts = openCipher.encrypt(
      [10_000n, 50_000_000_000n, 2_000_000n, 1n],
      openNonce
    );

    const openOffset = new anchor.BN((Date.now() + 2).toString());

    const [traderAcc] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), wallet.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .openPosition(
        openOffset,
        openCts[0], openCts[1], openCts[2], openCts[3],
        Array.from(openKeys.pub),
        nonceToU128(openNonce)
      )
      .accounts({ traderAcc })
      .rpc();

    await awaitComputationFinalization(provider, openOffset, program.programId, "confirmed");

    // Price crashed 30% — deep underwater
    const liqKeys   = makeClientKeys(mxePubkey);
    const liqCipher = new RescueCipher(liqKeys.secret);
    const liqNonce  = randomBytes(16);

    const liqCts = liqCipher.encrypt([35_000_000_000n, 500n], liqNonce);

    const liqOffset = new anchor.BN((Date.now() + 3).toString());

    const liqEv = awaitEvent<{ trader: anchor.web3.PublicKey; wasLiquidated: boolean }>(
      program, "LiquidationCheckedEvent"
    );

    await program.methods
      .checkLiquidation(
        liqOffset,
        liqCts[0], liqCts[1],
        Array.from(liqKeys.pub),
        nonceToU128(liqNonce)
      )
      .accounts({ trader: wallet.publicKey, traderAcc })
      .rpc();

    await awaitComputationFinalization(provider, liqOffset, program.programId, "confirmed");

    const ev  = await liqEv;
    const acc = await program.account.traderAccount.fetch(traderAcc);

    assert.isTrue(ev.wasLiquidated, "30% price crash should liquidate a thin-margin position");
    assert.isFalse(acc.isOpen);
    assert.isTrue(acc.isLiquidated);
  });

  // ─── compute pnl on close ───────────────────────────────────────────────

  it("computes encrypted PnL — only the closing trader can read it", async () => {
    // Use a fresh keypair so this test is independent of liquidation state above.
    const trader2 = anchor.web3.Keypair.generate();

    const airdrop = await provider.connection.requestAirdrop(
      trader2.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop, "confirmed");

    const prov2 = new anchor.AnchorProvider(
      provider.connection,
      new anchor.Wallet(trader2),
      { commitment: "confirmed" }
    );
    const prog2 = new anchor.Program<Shuu>(program.idl, prov2);

    const [traderAcc2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), trader2.publicKey.toBuffer()],
      program.programId
    );

    // Open at $50k, long 0.1 BTC
    const openKeys   = makeClientKeys(mxePubkey);
    const openCipher = new RescueCipher(openKeys.secret);
    const openNonce  = randomBytes(16);
    const openCts    = openCipher.encrypt([500_000n, 50_000_000_000n, 100_000n, 1n], openNonce);
    const openOffset = new anchor.BN((Date.now() + 4).toString());

    await prog2.methods
      .openPosition(
        openOffset,
        openCts[0], openCts[1], openCts[2], openCts[3],
        Array.from(openKeys.pub),
        nonceToU128(openNonce)
      )
      .accounts({ traderAcc: traderAcc2 })
      .rpc();

    await awaitComputationFinalization(prov2, openOffset, prog2.programId, "confirmed");

    // Close at $55k — should be a profit
    const closeKeys   = makeClientKeys(mxePubkey);
    const closeCipher = new RescueCipher(closeKeys.secret);
    const closeNonce  = randomBytes(16);
    const closeCts    = closeCipher.encrypt([55_000_000_000n], closeNonce);
    const closeOffset = new anchor.BN((Date.now() + 5).toString());

    type PnlEv = {
      trader:       anchor.web3.PublicKey;
      magnitudeCt:  number[];
      isProfitCt:   number[];
      resultNonce:  anchor.BN;
    };
    const pnlEv = awaitEvent<PnlEv>(prog2, "PnlComputedEvent");

    await prog2.methods
      .computePnl(
        closeOffset,
        closeCts[0],
        Array.from(closeKeys.pub),
        nonceToU128(closeNonce)
      )
      .accounts({ traderAcc: traderAcc2 })
      .rpc();

    await awaitComputationFinalization(prov2, closeOffset, prog2.programId, "confirmed");

    const ev = await pnlEv;

    // Decrypt the result — only possible with the trader's ephemeral private key.
    const resultNonce = Buffer.alloc(16);
    const nonceBuf    = ev.resultNonce.toArrayLike(Buffer, "le", 16);
    nonceBuf.copy(resultNonce);

    const [magnitude, isProfitRaw] = closeCipher.decrypt(
      [ev.magnitudeCt, ev.isProfitCt],
      resultNonce
    );
    const isProfit = isProfitRaw === 1n;

    console.log(`PnL: ${isProfit ? "profit" : "loss"} of ${magnitude.toString()} (scaled 1e6)`);

    // 0.1 BTC × ($55k − $50k) = 0.1 × $5000 = $500 → 500_000_000 in 1e6 scaled units
    assert.isTrue(isProfit);
    assert.equal(magnitude.toString(), "500000000");

    const acc = await prog2.account.traderAccount.fetch(traderAcc2);
    assert.isFalse(acc.isOpen);
  });
});
