import { useState, useCallback, useRef, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import IDL from "../assets/shuu.json";
import { sha256 } from "@noble/hashes/sha256";
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
} from "@arcium-hq/client";
import type { PositionState } from "../components/PositionCard";
import {
  encryptPosition,
  encryptLiqParams,
  encryptCloseParams,
  decryptPnl,
} from "../lib/crypto";
import { addHistoryEntry } from "./useHistory";

const PROGRAM_ID = new anchor.web3.PublicKey("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

const TOKEN_PROGRAM_ID            = new anchor.web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new anchor.web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// PDAs computed lazily on first use — findProgramAddressSync relies on Buffer/crypto
// which may not be ready at module-evaluation time (Vite polyfill timing).
let _pdas: { protocol: anchor.web3.PublicKey; mint: anchor.web3.PublicKey; vault: anchor.web3.PublicKey } | null = null;
function getPdas() {
  if (!_pdas) {
    _pdas = {
      protocol: anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("protocol")],  PROGRAM_ID)[0],
      mint:     anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("usdc_mint")], PROGRAM_ID)[0],
      vault:    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault")],     PROGRAM_ID)[0],
    };
  }
  return _pdas;
}

function getUserAta(owner: anchor.web3.PublicKey): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), getPdas().mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function nonceToU128(b: Uint8Array): anchor.BN {
  return new anchor.BN(Buffer.from(b).reverse().toString("hex"), 16);
}

// Random u64 for computation_offset. Random is safer than Date.now() because it
// never collides on rapid clicks (two clicks in the same millisecond would share
// an offset and hit Solana's "already processed" duplicate-signature cache).
function freshOffset(): anchor.BN {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  // BN constructor: (number-or-buffer, base, endian).
  // Pass hex string with "le" endian to get a u64-shaped BN that round-trips
  // through Anchor's borsh-u64 serialization correctly.
  return new anchor.BN(Buffer.from(buf).toString("hex"), 16, "le");
}

// Some wallets (Phantom on devnet via slow public RPC) auto-resubmit transactions
// that don't confirm fast enough. The second submission hits Solana's signature
// cache and bounces with "already been processed" — but the FIRST submission
// actually succeeded. So this error is functionally success.
function isAlreadyProcessedError(err: any): boolean {
  const msg = (err?.message || "") + " " + JSON.stringify(err?.logs || []);
  return msg.includes("already been processed") || msg.includes("AlreadyProcessed");
}

function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("no record of a prior credit") || msg.includes("insufficient lamports"))
    return "Insufficient SOL — get devnet SOL from faucet.solana.com";
  if (msg.includes("User rejected") || msg.includes("rejected the request"))
    return "Transaction rejected by wallet";
  if (msg.includes("wallet not connected")) return "Wallet not connected";
  if (msg.includes("MXE account has no cluster") || msg.includes("timeout"))
    return "Arcium network timed out — try again";
  if (msg.includes("InsufficientBalance") || msg.includes("0x1777"))
    return "Insufficient sUSDC balance — use the faucet then deposit";
  if (msg.includes("FaucetLimitExceeded") || msg.includes("0x1778"))
    return "Faucet limit is 10,000 sUSDC per call";
  if (msg.includes("NoOpenPosition") || msg.includes("0x1770"))
    return "No open position — open one first";
  if (msg.includes("WrongTrader") || msg.includes("0x1772"))
    return "Only the position owner can close it";
  // No known pattern — surface the raw error so it's debuggable
  return msg.length > 150 ? msg.slice(0, 150) + "…" : msg;
}

async function buildArciumAccounts(
  program: anchor.Program,
  offset: anchor.BN,
  circuitName: string
) {
  const mxeAccAddr  = getMXEAccAddress(program.programId);
  const arciumProg  = getArciumProgram(program.provider as anchor.AnchorProvider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mxeAcc      = await (arciumProg.account as any).mxeAccount.fetch(mxeAccAddr);

  if (mxeAcc.cluster === null || mxeAcc.cluster === undefined)
    throw new Error("MXE account has no cluster assigned — Arcium network unavailable");

  const cl: number = mxeAcc.cluster;
  const hash       = sha256(new TextEncoder().encode(circuitName));
  const compDefNum = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, true);

  return {
    mxeAccount:         mxeAccAddr,
    mempoolAccount:     getMempoolAccAddress(cl),
    executingPool:      getExecutingPoolAccAddress(cl),
    computationAccount: getComputationAccAddress(cl, offset),
    compDefAccount:     getCompDefAccAddress(program.programId, compDefNum),
    clusterAccount:     getClusterAccAddress(cl),
  };
}

export function useShuu() {
  const { connection }                    = useConnection();
  const { publicKey, signTransaction }    = useWallet();

  const [positionState, setPositionState] = useState<PositionState>({ status: "empty" });
  const [loading,       setLoading]       = useState(false);
  const [lastTxSig,     setLastTxSig]     = useState<string | null>(null);
  const [txError,       setTxError]       = useState<string | null>(null);
  const [usdcBalance,   setUsdcBalance]   = useState<number>(0);
  const [lockedCol,     setLockedCol]     = useState<number>(0);

  const closeCipherRef = useRef<ReturnType<typeof encryptCloseParams> | null>(null);

  // Tracks the params of the currently-open position so we can record a complete
  // history entry on settle. Set in openPosition, read in computePnl after settle.
  const openTradeRef = useRef<{
    market:     string;
    isLong:     boolean;
    collateral: number;
    entryPrice: number;
  } | null>(null);

  const getProgram = useCallback(async () => {
    if (!publicKey || !signTransaction) throw new Error("wallet not connected");
    const provider = new anchor.AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions: async (txs) => txs },
      { commitment: "confirmed" }
    );
    return new anchor.Program(IDL as anchor.Idl, provider);
  }, [connection, publicKey, signTransaction]);

  const traderPda = useCallback((): anchor.web3.PublicKey | null => {
    if (!publicKey) return null;
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("trader"), publicKey.toBuffer()],
      PROGRAM_ID
    );
    return pda;
  }, [publicKey]);

  // Fetch on-chain sUSDC balances
  const refreshBalance = useCallback(async () => {
    if (!publicKey) return;
    const pda = traderPda();
    if (!pda) return;
    try {
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs },
        { commitment: "confirmed" }
      );
      const prog = new anchor.Program(IDL as anchor.Idl, provider);
      const acc = await (prog.account as any).traderAccount.fetch(pda);
      setUsdcBalance(acc.usdcBalance.toNumber() / 1_000_000);
      setLockedCol(acc.lockedCollateral.toNumber() / 1_000_000);
    } catch {
      setUsdcBalance(0);
      setLockedCol(0);
    }
  }, [publicKey, connection, traderPda]);

  // Refresh when wallet connects
  useEffect(() => {
    if (publicKey) refreshBalance();
    else { setUsdcBalance(0); setLockedCol(0); }
  }, [publicKey, refreshBalance]);

  // ── initialize protocol (deployer calls once after anchor deploy) ──────────
  const initializeProtocol = useCallback(async () => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    try {
      const program = await getProgram();
      const sig = await (program.methods as any)
        .initialize()
        .accounts({
          payer:         publicKey,
          protocolState: getPdas().protocol,
          usdcMint:      getPdas().mint,
          vault:         getPdas().vault,
          tokenProgram:  TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setLastTxSig(sig);
    } catch (err) {
      console.error("initialize failed:", err);
      setTxError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram]);

  // ── faucet: mint 10,000 sUSDC to wallet ───────────────────────────────────
  const faucetMint = useCallback(async () => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    try {
      const program  = await getProgram();
      const userAta  = getUserAta(publicKey);
      const sig = await (program.methods as any)
        .faucetMint(new anchor.BN(10_000 * 1_000_000))
        .accounts({
          user:                   publicKey,
          protocolState:          getPdas().protocol,
          usdcMint:               getPdas().mint,
          userAta:                userAta,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setLastTxSig(sig);
      await refreshBalance();
    } catch (err) {
      console.error("faucet failed:", err);
      setTxError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram, refreshBalance]);

  // ── deposit sUSDC into protocol vault ─────────────────────────────────────
  const deposit = useCallback(async (amount: number) => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    try {
      const program  = await getProgram();
      const pda      = traderPda()!;
      const userAta  = getUserAta(publicKey);
      const amountBn = new anchor.BN(Math.round(amount * 1_000_000));
      const sig = await (program.methods as any)
        .deposit(amountBn)
        .accounts({
          user:         publicKey,
          userAta:      userAta,
          usdcMint:     getPdas().mint,
          vault:        getPdas().vault,
          traderAcc:    pda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setLastTxSig(sig);
      await refreshBalance();
    } catch (err) {
      console.error("deposit failed:", err);
      setTxError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram, traderPda, refreshBalance]);

  // ── withdraw available sUSDC ───────────────────────────────────────────────
  const withdraw = useCallback(async (amount: number) => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    try {
      const program  = await getProgram();
      const pda      = traderPda()!;
      const userAta  = getUserAta(publicKey);
      const amountBn = new anchor.BN(Math.round(amount * 1_000_000));
      const sig = await (program.methods as any)
        .withdraw(amountBn)
        .accounts({
          user:                   publicKey,
          protocolState:          getPdas().protocol,
          usdcMint:               getPdas().mint,
          userAta:                userAta,
          vault:                  getPdas().vault,
          traderAcc:              pda,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setLastTxSig(sig);
      await refreshBalance();
    } catch (err) {
      console.error("withdraw failed:", err);
      setTxError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram, traderPda, refreshBalance]);

  // ── open position ──────────────────────────────────────────────────────────
  const openPosition = useCallback(async (
    collateral: number,
    entryPrice: number,
    size:       number,
    isLong:     boolean
  ) => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    setPositionState({ status: "encrypting" });

    try {
      const program    = await getProgram();
      const mxePubkey  = await getMXEPublicKey(
        program.provider as anchor.AnchorProvider,
        program.programId
      );
      if (!mxePubkey) throw new Error("MXE public key unavailable");

      const enc             = encryptPosition(mxePubkey, collateral, entryPrice, size, isLong);
      const offset          = freshOffset();
      const pda             = traderPda()!;
      const arciumAccs      = await buildArciumAccounts(program, offset, "store_position_v5");
      const collateralFixed = new anchor.BN(Math.round(collateral * 1_000_000));

      try {
        const sig = await (program.methods as any)
          .openPosition(
            offset,
            enc.collateralCt,
            enc.entryPriceCt,
            enc.sizeCt,
            enc.isLongCt,
            enc.pubKey,
            nonceToU128(enc.nonce),
            collateralFixed,
          )
          .accounts({ traderAcc: pda, ...arciumAccs })
          .rpc();
        setLastTxSig(sig);
      } catch (err) {
        if (!isAlreadyProcessedError(err)) throw err;
        console.warn("openPosition: wallet retry hit dup-signature cache; tx is already on chain");
      }

      await awaitComputationFinalization(
        program.provider as anchor.AnchorProvider,
        offset,
        program.programId,
        "confirmed"
      );

      await refreshBalance();
      // Stash the open trade so we can build a complete history entry on settle.
      openTradeRef.current = {
        market:     "BTC-PERP", // single-market v1 — when multi-market is added, get from MarketContext
        isLong,
        collateral,
        entryPrice,
      };
      setPositionState({
        status:     "open",
        isLong,
        collateral: collateral.toFixed(2),
      });
    } catch (err) {
      console.error("open position failed:", err);
      setTxError(parseError(err));
      await refreshBalance();
      setPositionState({ status: "empty" });
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram, traderPda, refreshBalance]);

  // ── liquidation check ──────────────────────────────────────────────────────
  const checkLiquidation = useCallback(async (markPrice: number, marginBps: number) => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    setPositionState((prev) => prev.status === "open" ? { ...prev, status: "checking" } : prev);

    try {
      const program   = await getProgram();
      const mxePubkey = await getMXEPublicKey(
        program.provider as anchor.AnchorProvider,
        program.programId
      );
      if (!mxePubkey) throw new Error("MXE public key unavailable");

      const enc        = encryptLiqParams(mxePubkey, markPrice, marginBps);
      const offset     = freshOffset();
      const pda        = traderPda()!;
      const arciumAccs = await buildArciumAccounts(program, offset, "check_liquidation_v5");

      try {
        const sig = await (program.methods as any)
          .checkLiquidation(
            offset,
            enc.markPriceCt,
            enc.marginBpsCt,
            enc.pubKey,
            nonceToU128(enc.nonce)
          )
          .accounts({ trader: publicKey, traderAcc: pda, ...arciumAccs })
          .rpc();
        setLastTxSig(sig);
      } catch (err) {
        if (!isAlreadyProcessedError(err)) throw err;
        console.warn("checkLiquidation: wallet retry hit dup-signature cache; tx is already on chain");
      }

      await awaitComputationFinalization(
        program.provider as anchor.AnchorProvider,
        offset,
        program.programId,
        "confirmed"
      );

      const acc = await (program.account as any).traderAccount.fetch(pda);

      if (acc.isLiquidated) {
        await refreshBalance();
        setPositionState({ status: "liquidated" });
      } else {
        setPositionState((prev) =>
          prev.status === "checking"
            ? { status: "open", isLong: (prev as any).isLong ?? true, collateral: (prev as any).collateral ?? "" }
            : prev
        );
      }
    } catch (err) {
      console.error("liquidation check failed:", err);
      setTxError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram, traderPda, refreshBalance]);

  // ── compute pnl / close position ──────────────────────────────────────────
  const computePnl = useCallback(async (exitPrice: number) => {
    if (!publicKey) return;
    setTxError(null);
    setLoading(true);
    setPositionState({ status: "closing" });

    try {
      const program   = await getProgram();
      const mxePubkey = await getMXEPublicKey(
        program.provider as anchor.AnchorProvider,
        program.programId
      );
      if (!mxePubkey) throw new Error("MXE public key unavailable");

      const enc        = encryptCloseParams(mxePubkey, exitPrice);
      closeCipherRef.current = enc;
      const offset     = freshOffset();
      const pda        = traderPda()!;
      const arciumAccs = await buildArciumAccounts(program, offset, "compute_pnl_v5");

      let sig: string | null = null;
      try {
        sig = await (program.methods as any)
          .computePnl(
            offset,
            enc.exitPriceCt,
            enc.pubKey,
            nonceToU128(enc.nonce)
          )
          .accounts({ traderAcc: pda, ...arciumAccs })
          .rpc();
        setLastTxSig(sig);
      } catch (err) {
        if (!isAlreadyProcessedError(err)) throw err;
        console.warn("computePnl: wallet retry hit dup-signature cache; tx is already on chain");
      }

      // Wait for Arcium to finalize the computation, then parse PnlComputedEvent from
      // the callback tx logs. We don't use program.addEventListener because public RPCs
      // (Helius free, devnet endpoint) drop websocket messages unreliably.
      await awaitComputationFinalization(
        program.provider as anchor.AnchorProvider,
        offset,
        program.programId,
        "confirmed"
      );

      // Poll the COMPUTATION ACCOUNT (unique per call) — not the trader account —
      // so we never pick up an old callback from a previous close cycle.
      const eventCoder = new anchor.BorshEventCoder(IDL as anchor.Idl);
      const computationAcc = arciumAccs.computationAccount;
      let pnlResult: { magnitude: string; isProfit: boolean } | null = null;
      for (let i = 0; i < 60 && pnlResult === null; i++) {
        await new Promise(r => setTimeout(r, 2000));
        let sigs: Awaited<ReturnType<typeof connection.getSignaturesForAddress>> = [];
        try {
          sigs = await connection.getSignaturesForAddress(computationAcc, { limit: 10 });
        } catch (e) {
          console.warn("getSignaturesForAddress failed, retrying:", (e as Error).message);
          continue;
        }
        for (const s of sigs) {
          if (s.err) continue;
          if (s.signature === sig) continue;
          let tx: Awaited<ReturnType<typeof connection.getTransaction>> = null;
          try {
            tx = await connection.getTransaction(s.signature, {
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            });
          } catch (e) {
            console.warn("getTransaction failed, skipping:", (e as Error).message);
            continue;
          }
          const logs = tx?.meta?.logMessages || [];
          if (!logs.some(l => l.includes("ComputePnlV5Callback"))) continue;
          for (const line of logs) {
            if (!line.startsWith("Program data: ")) continue;
            try {
              const ev: any = eventCoder.decode(line.replace("Program data: ", ""));
              if (ev && ev.name === "PnlComputedEvent") {
                // BorshEventCoder returns raw Rust field names (snake_case),
                // unlike program.addEventListener which auto-camelCases them.
                const nonceBytes = (ev.data.result_nonce as anchor.BN).toArrayLike(Buffer, "le", 16);
                pnlResult = decryptPnl(
                  enc.cipher,
                  ev.data.magnitude_ct as number[],
                  ev.data.is_profit_ct as number[],
                  nonceBytes
                );
                break;
              }
            } catch { /* skip non-matching events */ }
          }
          if (pnlResult) break;
        }
      }
      if (!pnlResult) throw new Error("PnlComputedEvent not found in callback tx logs after 120s");

      // Settle on-chain: updates usdc_balance with final payout
      const magnitudeFixed = new anchor.BN(
        Math.round(parseFloat(pnlResult.magnitude) * 1_000_000).toString()
      );
      let settleSig: string | null = null;
      try {
        settleSig = await (program.methods as any)
          .settlePosition(magnitudeFixed, pnlResult.isProfit)
          .accounts({ payer: publicKey, traderAcc: pda })
          .rpc();
        if (settleSig) setLastTxSig(settleSig);
      } catch (err) {
        if (!isAlreadyProcessedError(err)) throw err;
        console.warn("settlePosition: wallet retry hit dup-signature cache; tx is already on chain");
      }

      // Record the closed trade in history (per-wallet localStorage).
      const opened = openTradeRef.current;
      if (opened) {
        addHistoryEntry(publicKey.toBase58(), {
          ts:         Date.now(),
          market:     opened.market,
          side:       opened.isLong ? "long" : "short",
          collateral: opened.collateral,
          entryPrice: opened.entryPrice,
          exitPrice,
          pnl:        parseFloat(pnlResult.magnitude),
          isProfit:   pnlResult.isProfit,
          txSig:      settleSig || sig || "",
        });
        openTradeRef.current = null;
      }

      await refreshBalance();
      setPositionState({
        status:   "closed",
        pnl:      pnlResult.magnitude,
        isProfit: pnlResult.isProfit,
      });
    } catch (err) {
      const e = err as any;
      console.error("compute pnl failed:");
      console.error("  message:", e?.message);
      console.error("  code:   ", e?.code ?? e?.error?.errorCode);
      console.error("  logs:   ", e?.logs ?? e?.transactionLogs);
      console.error("  full:   ", err);
      setTxError(parseError(err));
      setPositionState({ status: "empty" });
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram, traderPda, refreshBalance]);

  return {
    positionState,
    loading,
    lastTxSig,
    txError,
    clearTxError:  () => setTxError(null),
    openPosition,
    checkLiquidation,
    computePnl,
    initializeProtocol,
    faucetMint,
    deposit,
    withdraw,
    refreshBalance,
    connected:     !!publicKey,
    availableUsdc: usdcBalance,
    lockedCol,
  };
}
