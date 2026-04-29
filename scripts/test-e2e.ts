/**
 * End-to-end test: faucet → deposit → open long → check liq → close · reveal pnl → settle
 * Persists test keypair to scripts/test-wallet.json across runs so the wallet can be pre-funded.
 */
import * as anchor from "@coral-xyz/anchor";
import { readFileSync, writeFileSync, existsSync } from "fs";
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
  awaitComputationFinalization,
  RescueCipher,
} from "@arcium-hq/client";
import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";

const IDL        = JSON.parse(readFileSync(join(__dirname, "../target/idl/shuu.json"), "utf8"));
const PROGRAM_ID = new anchor.web3.PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");
const TOKEN_PROGRAM_ID            = new anchor.web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new anchor.web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const RPC = "https://api.devnet.solana.com";

// Trade parameters
const TEST_ENTRY_PRICE  = 67_000;   // $67k BTC entry
const TEST_EXIT_PRICE   = 70_350;   // +5% → profit
const TEST_COLLATERAL   = 500;      // $500 USDC collateral
const TEST_LEVERAGE     = 10;
const TEST_SIZE         = (TEST_COLLATERAL * TEST_LEVERAGE) / TEST_ENTRY_PRICE;
const IS_LONG           = true;

// ── helpers ──────────────────────────────────────────────────────────────────

function getPdas() {
  return {
    protocol: anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("protocol")],  PROGRAM_ID)[0],
    mint:     anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("usdc_mint")], PROGRAM_ID)[0],
    vault:    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault")],     PROGRAM_ID)[0],
  };
}

function getUserAta(owner: anchor.web3.PublicKey): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), getPdas().mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function traderPda(user: anchor.web3.PublicKey): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("trader"), user.toBuffer()],
    PROGRAM_ID
  )[0];
}

function nonceToU128(b: Uint8Array): anchor.BN {
  return new anchor.BN(Buffer.from(b).reverse().toString("hex"), 16);
}

function rngBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  // Node.js 22 has globalThis.crypto
  (globalThis as any).crypto.getRandomValues(buf);
  return buf;
}

function toFixed6(n: number): bigint {
  return BigInt(Math.round(n * 1_000_000));
}

async function buildArciumAccounts(
  program: anchor.Program,
  offset: anchor.BN,
  circuitName: string
) {
  const mxeAccAddr  = getMXEAccAddress(program.programId);
  const arciumProg  = getArciumProgram(program.provider as anchor.AnchorProvider);
  const mxeAcc      = await (arciumProg.account as any).mxeAccount.fetch(mxeAccAddr);

  if (mxeAcc.cluster === null || mxeAcc.cluster === undefined)
    throw new Error("MXE account has no cluster assigned — Arcium network unavailable");

  const cl          = mxeAcc.cluster as number;
  const hash        = sha256(new TextEncoder().encode(circuitName));
  const compDefNum  = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, true);

  return {
    mxeAccount:         mxeAccAddr,
    mempoolAccount:     getMempoolAccAddress(cl),
    executingPool:      getExecutingPoolAccAddress(cl),
    computationAccount: getComputationAccAddress(cl, offset),
    compDefAccount:     getCompDefAccAddress(program.programId, compDefNum),
    clusterAccount:     getClusterAccAddress(cl),
  };
}

// ── logging ───────────────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`  ✓ ${msg}`); }
function info(msg: string) { console.log(`    ${msg}`); }
function fail(msg: string) { console.log(`  ✗ ${msg}`); }

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`  ▸ ${label} `);
  try {
    const t0 = Date.now();
    const r = await fn();
    const ms = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`✓  (${ms}s)\n`);
    return r;
  } catch (err: any) {
    process.stdout.write(`✗\n`);
    throw err;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  shuu · end-to-end devnet test                      ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Persist test keypair so it survives runs and can be pre-funded
  const walletPath = join(__dirname, "test-wallet.json");
  let payer: anchor.web3.Keypair;
  if (existsSync(walletPath)) {
    const raw = JSON.parse(readFileSync(walletPath, "utf8"));
    payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
    info(`loaded existing test wallet from scripts/test-wallet.json`);
  } else {
    payer = anchor.web3.Keypair.generate();
    writeFileSync(walletPath, JSON.stringify(Array.from(payer.secretKey)));
    info(`created new test wallet → scripts/test-wallet.json`);
  }

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const wallet     = new anchor.Wallet(payer);
  const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program    = new anchor.Program(IDL as anchor.Idl, provider);

  info(`test wallet : ${payer.publicKey.toBase58()}`);
  info(`program     : ${PROGRAM_ID.toBase58()}`);
  info(`trade       : LONG ${TEST_SIZE.toFixed(6)} BTC  entry $${TEST_ENTRY_PRICE}  ×${TEST_LEVERAGE}`);
  console.log();

  const pdas    = getPdas();
  const userAta = getUserAta(payer.publicKey);
  const pda     = traderPda(payer.publicKey);

  // ── 0. check balance ────────────────────────────────────────────────────────
  await step("check SOL balance", async () => {
    const bal = await connection.getBalance(payer.publicKey);
    const sol = bal / anchor.web3.LAMPORTS_PER_SOL;
    info(`balance: ${sol.toFixed(4)} SOL`);
    if (sol < 0.05) throw new Error(`Need at least 0.05 SOL, have ${sol.toFixed(4)}`);
  });

  // ── 1. faucet_mint ──────────────────────────────────────────────────────────
  await step("faucet_mint  10,000 sUSDC", async () => {
    const sig = await (program.methods as any)
      .faucetMint(new anchor.BN(10_000 * 1_000_000))
      .accounts({
        user:                   payer.publicKey,
        protocolState:          pdas.protocol,
        usdcMint:               pdas.mint,
        userAta,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          anchor.web3.SystemProgram.programId,
      })
      .rpc();
    info(`tx: ${sig}`);
    info(`explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  });

  // ── 2. deposit ──────────────────────────────────────────────────────────────
  await step("deposit       1,000 sUSDC into protocol", async () => {
    const sig = await (program.methods as any)
      .deposit(new anchor.BN(1_000 * 1_000_000))
      .accounts({
        user:         payer.publicKey,
        userAta,
        usdcMint:     pdas.mint,
        vault:        pdas.vault,
        traderAcc:    pda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    info(`tx: ${sig}`);
    const acc = await (program.account as any).traderAccount.fetch(pda);
    const bal = acc.usdcBalance.toNumber() / 1_000_000;
    info(`protocol balance: ${bal} sUSDC`);
    if (bal < 1000) throw new Error(`deposit: expected 1000 sUSDC, got ${bal}`);
  });

  // ── 3. open_position ────────────────────────────────────────────────────────
  await step("open_position  LONG · Arcium MPC (may take ~60s)", async () => {
    const mxePubkey = await getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxePubkey) throw new Error("MXE public key unavailable");

    const priv   = x25519.utils.randomSecretKey();
    const pub    = x25519.getPublicKey(priv);
    const secret = x25519.getSharedSecret(priv, mxePubkey);
    const cipher = new RescueCipher(secret);
    const nonce  = rngBytes(16);

    const cts = cipher.encrypt([
      toFixed6(TEST_COLLATERAL),
      toFixed6(TEST_ENTRY_PRICE),
      toFixed6(TEST_SIZE),
      IS_LONG ? 1n : 0n,
    ], nonce);

    const offset     = new anchor.BN(Date.now().toString());
    const arciumAccs = await buildArciumAccounts(program, offset, "store_position_v5");
    const collFixed  = new anchor.BN(Math.round(TEST_COLLATERAL * 1_000_000));

    const sig = await (program.methods as any)
      .openPosition(
        offset,
        Array.from(cts[0]),
        Array.from(cts[1]),
        Array.from(cts[2]),
        Array.from(cts[3]),
        Array.from(pub),
        nonceToU128(nonce),
        collFixed,
      )
      .accounts({ traderAcc: pda, ...arciumAccs })
      .rpc();

    info(`tx: ${sig}`);
    info(`open_position explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    info(`computation account:    https://explorer.solana.com/address/${arciumAccs.computationAccount.toBase58()}?cluster=devnet`);
    info(`trader account:         https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`);
    info(`waiting for Arcium computation to finalize…`);
    await awaitComputationFinalization(provider, offset, PROGRAM_ID, "confirmed");
    info(`computation finalized — now watching for store_position_v5_callback…`);
    info(`(open Solana Explorer links above and look for a failed tx from Arcium program calling shuu)`);

    // Also listen for the PositionOpenedEvent — fires inside the callback if it succeeds
    let eventFired = false;
    const listenerId = program.addEventListener("PositionOpenedEvent", (ev: any) => {
      eventFired = true;
      info(`PositionOpenedEvent received — callback executed successfully, trader: ${ev.trader.toBase58()}`);
    });

    let opened = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const acc = await (program.account as any).traderAccount.fetch(pda);
      if (acc.isOpen) { opened = true; break; }
      if (i % 5 === 4) process.stdout.write(`\n    still waiting… ${(i + 1) * 2}s`);
      else process.stdout.write(".");
    }
    program.removeEventListener(listenerId);

    if (!opened) {
      if (!eventFired) {
        throw new Error(
          "store_position_v5_callback never fired after 120s.\n" +
          "  → Check the Solana Explorer links above for failed callback transactions.\n" +
          "  → CAUSE A: no failed tx found = Arcium relay not calling the callback (infra issue).\n" +
          "  → CAUSE B: failed tx found   = callback instruction is failing (check program logs)."
        );
      } else {
        throw new Error("PositionOpenedEvent fired but is_open not set — unexpected state");
      }
    }
    const final = await (program.account as any).traderAccount.fetch(pda);
    const locked = final.lockedCollateral.toNumber() / 1_000_000;
    info(`position open — locked collateral: ${locked} sUSDC`);
  });

  // ── 4. check_liquidation (mark == entry → should NOT liquidate) ─────────────
  await step("check_liquidation  mark=entry · should NOT liquidate", async () => {
    const mxePubkey = await getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxePubkey) throw new Error("MXE public key unavailable");

    const priv   = x25519.utils.randomSecretKey();
    const pub    = x25519.getPublicKey(priv);
    const secret = x25519.getSharedSecret(priv, mxePubkey);
    const cipher = new RescueCipher(secret);
    const nonce  = rngBytes(16);
    const MARGIN_BPS = 500; // 5% maintenance margin

    const cts = cipher.encrypt([toFixed6(TEST_ENTRY_PRICE), BigInt(MARGIN_BPS)], nonce);

    const offset     = new anchor.BN((Date.now() + 1).toString());
    const arciumAccs = await buildArciumAccounts(program, offset, "check_liquidation_v5");

    const sig = await (program.methods as any)
      .checkLiquidation(
        offset,
        Array.from(cts[0]),
        Array.from(cts[1]),
        Array.from(pub),
        nonceToU128(nonce),
      )
      .accounts({ trader: payer.publicKey, traderAcc: pda, ...arciumAccs })
      .rpc();

    info(`tx: ${sig}`);
    info(`waiting for Arcium computation to finalize…`);
    await awaitComputationFinalization(provider, offset, PROGRAM_ID, "confirmed");

    // Poll for callback confirmation
    info(`polling for check_liquidation_callback…`);
    await new Promise(r => setTimeout(r, 4000));

    const acc = await (program.account as any).traderAccount.fetch(pda);
    if (acc.isLiquidated) throw new Error("position incorrectly liquidated at entry price");
    info(`result: NOT liquidated ✓`);
  });

  // ── 5. compute_pnl (close at +5%) ───────────────────────────────────────────
  let pnlResult: { magnitude: string; isProfit: boolean } | null = null;

  await step(`compute_pnl    exit $${TEST_EXIT_PRICE} (+5%) · Arcium MPC`, async () => {
    const mxePubkey = await getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxePubkey) throw new Error("MXE public key unavailable");

    const priv   = x25519.utils.randomSecretKey();
    const pub    = x25519.getPublicKey(priv);
    const secret = x25519.getSharedSecret(priv, mxePubkey);
    const cipher = new RescueCipher(secret);
    const nonce  = rngBytes(16);

    const cts = cipher.encrypt([toFixed6(TEST_EXIT_PRICE)], nonce);

    const offset     = new anchor.BN((Date.now() + 2).toString());
    const arciumAccs = await buildArciumAccounts(program, offset, "compute_pnl_v5");

    const sig = await (program.methods as any)
      .computePnl(
        offset,
        Array.from(cts[0]),
        Array.from(pub),
        nonceToU128(nonce),
      )
      .accounts({ traderAcc: pda, ...arciumAccs })
      .rpc();

    info(`tx: ${sig}`);
    info(`waiting for Arcium computation finalization…`);
    await awaitComputationFinalization(provider, offset, PROGRAM_ID, "confirmed");

    // Helius free tier websockets are unreliable, so parse the event from the callback tx logs instead
    info(`finalized — searching for PnlComputedEvent in callback tx logs…`);
    const eventCoder = new anchor.BorshEventCoder(IDL as anchor.Idl);
    const sigSentAt = Date.now();
    pnlResult = await new Promise<{ magnitude: string; isProfit: boolean }>(async (resolve, reject) => {
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        // Poll the computation account (unique per call) so we never pick up an old callback
        const sigs = await connection.getSignaturesForAddress(arciumAccs.computationAccount, { limit: 10 });
        for (const s of sigs) {
          if (s.err) continue;
          if (s.signature === sig) continue;
          if (s.blockTime && s.blockTime * 1000 < sigSentAt - 5000) continue;
          const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
          const logs = tx?.meta?.logMessages || [];
          if (!logs.some(l => l.includes("ComputePnlV5Callback"))) continue;
          for (const line of logs) {
            if (!line.startsWith("Program data: ")) continue;
            try {
              const ev: any = eventCoder.decode(line.replace("Program data: ", ""));
              if (ev && ev.name === "PnlComputedEvent") {
                // BorshEventCoder returns raw snake_case Rust field names,
                // unlike program.addEventListener which auto-camelCases.
                const nonceBytes = (ev.data.result_nonce as anchor.BN).toArrayLike(Buffer, "le", 16);
                const [mag, profitRaw] = cipher.decrypt(
                  [ev.data.magnitude_ct as number[], ev.data.is_profit_ct as number[]],
                  nonceBytes
                );
                return resolve({
                  magnitude: (Number(mag) / 1_000_000).toFixed(2),
                  isProfit: profitRaw === 1n,
                });
              }
            } catch { /* not the event we want */ }
          }
        }
        process.stdout.write(".");
      }
      reject(new Error("PnlComputedEvent not found in callback tx logs after 120s"));
    });

    info(`PnL: ${pnlResult.isProfit ? "PROFIT" : "LOSS"} $${pnlResult.magnitude}`);
    if (!pnlResult.isProfit) throw new Error(`Expected profit at +5% exit but got loss: $${pnlResult.magnitude}`);
  });

  // ── 6. settle_position ──────────────────────────────────────────────────────
  await step("settle_position  update on-chain balance", async () => {
    if (!pnlResult) throw new Error("no pnlResult");
    const magnitudeFixed = new anchor.BN(
      Math.round(parseFloat(pnlResult.magnitude) * 1_000_000).toString()
    );
    const sig = await (program.methods as any)
      .settlePosition(magnitudeFixed, pnlResult.isProfit)
      .accounts({ payer: payer.publicKey, traderAcc: pda })
      .rpc();
    info(`tx: ${sig}`);

    const acc       = await (program.account as any).traderAccount.fetch(pda);
    const finalBal  = acc.usdcBalance.toNumber() / 1_000_000;
    const startBal  = 1000 - TEST_COLLATERAL; // 500 free after collateral locked
    const expected  = startBal + parseFloat(pnlResult.magnitude) + TEST_COLLATERAL;
    info(`final balance: ${finalBal.toFixed(2)} sUSDC  (expected ≈ ${expected.toFixed(2)})`);
    if (acc.isOpen) throw new Error("position still marked open after settle");
    if (!acc.isSettled) throw new Error("is_settled not set after settle");
  });

  // ── done ────────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  ALL 6 STEPS PASSED — end-to-end flow verified ✓   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  process.exit(0);
}

main().catch((err: any) => {
  console.error("\n  ✗ FATAL:", err?.message ?? err);
  if (err?.logs) {
    console.error("  program logs:");
    (err.logs as string[]).forEach((l: string) => console.error("   ", l));
  }
  process.exit(1);
});
