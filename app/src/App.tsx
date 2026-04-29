import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletModalProvider, useWalletModal } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

import { MarketProvider, useMarkets } from "./context/MarketContext";
import { LogoMark }        from "./components/Logo";
import { StatsBar }        from "./components/StatsBar";
import { MarketList }      from "./components/MarketList";
import { Chart }           from "./components/Chart";
import { OrderBook }       from "./components/OrderBook";
import { OrderForm }       from "./components/OrderForm";
import { PositionsPanel }  from "./components/PositionsPanel";
import { AmbientCanvas }   from "./components/AmbientCanvas";
import { WelcomeModal }    from "./components/WelcomeModal";
import { SealCeremony }   from "./components/SealCeremony";
import { useShuu }         from "./hooks/useShuu";
import { useBalance }      from "./hooks/useBalance";

// Configurable via Vercel env. Public devnet rate-limits aggressively;
// for a usable demo, set VITE_RPC_URL to a Helius/QuickNode/Triton devnet endpoint.
const DEVNET_RPC = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";

// ── Inner app ─────────────────────────────────────────────────────────────────

function Terminal() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const {
    positionState, loading, lastTxSig,
    txError, clearTxError,
    openPosition, checkLiquidation, computePnl,
    faucetMint, deposit, withdraw,
    availableUsdc, lockedCol,
  } = useShuu();
  const { sol: solBalance, loading: balanceLoading } = useBalance();
  const { current: market } = useMarkets();
  const [timeframe, setTimeframe]   = useState("5m");
  const [modalDismissed, setDismiss] = useState(false);

  const short = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}···${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 2 }}>

      {/* ── Header ── */}
      <header style={{
        height: 46, display: "flex", alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(6,6,16,0.98)", backdropFilter: "blur(20px)",
        flexShrink: 0, zIndex: 100, gap: 0,
      }}>

        {/* Logo block */}
        <div style={{
          width: 192, height: "100%", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10, padding: "0 16px",
          borderRight: "1px solid rgba(255,255,255,0.07)",
        }}>
          <LogoMark size={28} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700,
              color: "#e8e8f5", letterSpacing: "-0.02em",
            }}>
              shuu
            </span>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 7,
              color: "rgba(124,58,237,0.55)", letterSpacing: "0.22em",
              textTransform: "uppercase", marginTop: 1,
            }}>
              silent perps
            </span>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ flex: 1, height: "100%", overflow: "hidden" }}>
          <StatsBar />
        </div>

        {/* Right controls */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 14px", borderLeft: "1px solid rgba(255,255,255,0.07)",
          height: "100%", flexShrink: 0,
        }}>
          {/* Network pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.02)",
          }}>
            <motion.span
              style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed", display: "block" }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.38)", letterSpacing: "0.12em" }}>
              DEVNET · ARCIUM
            </span>
          </div>

          {/* Balances */}
          {connected && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderLeft: "1px solid rgba(255,255,255,0.05)", paddingLeft: 10 }}>

              {/* sUSDC balance */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.3)", letterSpacing: "0.08em" }}>sUSDC</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: availableUsdc === 0 ? "rgba(232,232,245,0.35)" : "rgba(232,232,245,0.72)" }}>
                  {availableUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {lockedCol > 0 && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 7, color: "rgba(124,58,237,0.5)", letterSpacing: "0.06em" }}>
                    +{lockedCol.toLocaleString("en-US", { maximumFractionDigits: 0 })} locked
                  </span>
                )}
              </div>

              {/* SOL balance */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.3)", letterSpacing: "0.08em" }}>SOL</span>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
                  color: solBalance !== null && solBalance < 0.05 ? "#f59e0b" : "rgba(232,232,245,0.72)",
                }}>
                  {balanceLoading ? "···" : solBalance !== null ? solBalance.toFixed(3) : "—"}
                </span>
              </div>

              {!balanceLoading && (solBalance === null || solBalance < 0.05) && (
                <a
                  href="https://faucet.solana.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "3px 8px", borderRadius: 5,
                    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.28)",
                    color: "#f59e0b", fontFamily: "var(--mono)", fontSize: 8,
                    textDecoration: "none", letterSpacing: "0.08em",
                  }}
                >
                  get SOL
                </a>
              )}
            </div>
          )}

          {/* Wallet button */}
          {connected ? (
            <motion.button
              whileHover={{ background: "rgba(255,69,96,0.08)", borderColor: "rgba(255,69,96,0.4)", color: "#ff4560" }}
              onClick={disconnect}
              style={{
                padding: "5px 14px", borderRadius: 7,
                background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)",
                color: "#b08ff5", fontFamily: "var(--mono)", fontSize: 9,
                letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {short}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: "0 0 20px rgba(124,58,237,0.25)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setVisible(true)}
              style={{
                padding: "6px 16px", borderRadius: 7,
                background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(34,211,238,0.06))",
                border: "1px solid rgba(124,58,237,0.45)", color: "#9b5cf6",
                fontFamily: "var(--mono)", fontSize: 9,
                letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
              }}
            >
              connect wallet
            </motion.button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Markets sidebar */}
        <MarketList />

        {/* Centre column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Timeframe bar */}
          <div style={{
            height: 34, display: "flex", alignItems: "center",
            gap: 2, padding: "0 14px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(0,0,0,0.2)", flexShrink: 0,
          }}>
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((t) => (
              <button key={t} onClick={() => setTimeframe(t)}
                style={{
                  padding: "3px 9px", borderRadius: 5,
                  background: timeframe === t ? "rgba(124,58,237,0.15)" : "transparent",
                  border: `1px solid ${timeframe === t ? "rgba(124,58,237,0.4)" : "transparent"}`,
                  color: timeframe === t ? "#b08ff5" : "rgba(232,232,245,0.3)",
                  fontFamily: "var(--mono)", fontSize: 9,
                  cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.15s",
                }}
              >{t}</button>
            ))}

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.18)", letterSpacing: "0.1em" }}>
                ARCIUM MPC · SEALED
              </span>
              <motion.span
                style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed", display: "block" }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
            </div>
          </div>

          {/* Chart */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <Chart basePrice={market.price} marketSymbol={market.symbol} />
          </div>

          {/* Positions panel */}
          <div style={{ height: 200, flexShrink: 0, overflow: "hidden" }}>
            <PositionsPanel
              state={positionState}
              lastTxSig={lastTxSig}
              onCheckLiquidation={checkLiquidation}
              onClose={computePnl}
              loading={loading}
            />
          </div>
        </div>

        {/* Right column — order book + form */}
        <div style={{
          width: 300, display: "flex", flexDirection: "column",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0, overflow: "hidden",
        }}>
          {/* Order book */}
          <div style={{ height: 268, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <OrderBook />
          </div>

          {/* Order form or connect prompt */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {connected ? (
              <OrderForm
                onOpen={openPosition}
                onFaucet={faucetMint}
                onDeposit={deposit}
                onWithdraw={withdraw}
                hasPosition={positionState.status === "open" || positionState.status === "checking"}
                isLiquidated={positionState.status === "liquidated"}
                loading={loading}
                availableUsdc={availableUsdc}
              />
            ) : (
              <ConnectPrompt onConnect={() => setVisible(true)} />
            )}
          </div>
        </div>

      </div>

      {/* Welcome overlay */}
      <WelcomeModal
        visible={!connected && !modalDismissed}
        onConnect={() => { setVisible(true); setDismiss(true); }}
        onDismiss={() => setDismiss(true)}
      />

      {/* Seal ceremony — fires when position moves into encrypting state */}
      <SealCeremony active={positionState.status === "encrypting"} />

      {/* Transaction error toast */}
      <AnimatePresence>
        {txError && (
          <motion.div
            key="tx-error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22 }}
            style={{
              position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
              zIndex: 950, background: "rgba(12,4,4,0.96)",
              border: "1px solid rgba(255,69,96,0.38)", borderRadius: 8,
              padding: "11px 16px", display: "flex", alignItems: "center", gap: 12,
              boxShadow: "0 0 28px rgba(255,69,96,0.12)", minWidth: 280, maxWidth: 480,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="6" stroke="#ff4560" strokeWidth="1.2" />
              <path d="M7 4v3.5M7 10h.01" stroke="#ff4560" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "#ff8599", flex: 1, letterSpacing: "0.02em" }}>
              {txError}
            </span>
            <button
              onClick={clearTxError}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                cursor: "pointer", fontSize: 16, padding: "0 2px", lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", gap: 16, padding: 24,
    }}>
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <LogoMark size={44} />
      </motion.div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(232,232,245,0.75)", marginBottom: 6 }}>
          connect to trade privately
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(232,232,245,0.3)", letterSpacing: "0.1em" }}>
          phantom · solana devnet
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.04, boxShadow: "0 0 24px rgba(124,58,237,0.25)" }}
        whileTap={{ scale: 0.97 }}
        onClick={onConnect}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 8,
          background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.4)",
          color: "#9b5cf6", fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer",
        }}
      >
        connect wallet
      </motion.button>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <>
      <AmbientCanvas />
      <ConnectionProvider endpoint={DEVNET_RPC}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <MarketProvider>
              <Terminal />
            </MarketProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </>
  );
}
