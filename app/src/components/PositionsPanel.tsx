import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PositionState } from "./PositionCard";
import { useMarkets } from "../context/MarketContext";
import { CipherText } from "./CipherText";
import { useHistory, type HistoryEntry } from "../hooks/useHistory";

type Tab = "positions" | "trades" | "history";

interface Props {
  state:              PositionState;
  lastTxSig:          string | null;
  onCheckLiquidation: (markPrice: number, marginBps: number) => void;
  onClose:            (exitPrice: number) => void;
  loading:            boolean;
}

const MOCK_TRADES = [
  { time: "12:41:02", side: "buy"  as const, size: "0.0142", price: "67,389.20" },
  { time: "12:40:58", side: "sell" as const, size: "0.1000", price: "67,381.50" },
  { time: "12:40:51", side: "buy"  as const, size: "0.0280", price: "67,394.00" },
  { time: "12:40:44", side: "sell" as const, size: "0.0070", price: "67,371.80" },
  { time: "12:40:39", side: "buy"  as const, size: "0.0520", price: "67,378.40" },
  { time: "12:40:31", side: "sell" as const, size: "0.3000", price: "67,362.10" },
  { time: "12:40:24", side: "buy"  as const, size: "0.0160", price: "67,370.90" },
];

export function PositionsPanel({ state, lastTxSig, onCheckLiquidation, onClose, loading }: Props) {
  const [tab, setTab] = useState<Tab>("positions");
  const { current: m } = useMarkets();
  const history = useHistory();

  const isOpen    = state.status === "open" || state.status === "checking";
  const isClosed  = state.status === "closed";
  const isLiq     = state.status === "liquidated";
  const dp        = m.base === "BTC" || m.base === "ETH" ? 2 : 3;

  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", height: "100%",
      background: "rgba(0,0,0,0.12)",
    }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, alignItems: "center" }}>
        {(["positions", "trades", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "7px 16px",
              background: "transparent",
              borderBottom: `2px solid ${tab === t ? "#7c3aed" : "transparent"}`,
              borderTop: "none", borderLeft: "none", borderRight: "none",
              color: tab === t ? "#b08ff5" : "rgba(232,232,245,0.35)",
              fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.12em",
              textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {t}
            {t === "positions" && isOpen && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00d97e", display: "inline-block" }} />
            )}
          </button>
        ))}

        {/* Tx link */}
        {lastTxSig && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingRight: 14 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.25)", letterSpacing: "0.1em" }}>
              LAST TX
            </span>
            <a
              href={`https://explorer.solana.com/tx/${lastTxSig}?cluster=devnet`}
              target="_blank" rel="noreferrer"
              style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(124,58,237,0.65)", textDecoration: "none" }}
            >
              {lastTxSig.slice(0, 8)}···{lastTxSig.slice(-6)} ↗
            </a>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <AnimatePresence mode="wait">

          {tab === "positions" && (
            <motion.div key="pos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isOpen ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {["market", "side", "size", "collateral", "entry", "mark", "liq. price", "uPnL", "status", "actions"].map((h) => (
                        <th key={h} style={{
                          padding: "6px 14px", fontFamily: "var(--mono)", fontSize: 8,
                          color: "rgba(232,232,245,0.32)", letterSpacing: "0.1em",
                          textTransform: "uppercase", textAlign: "left", fontWeight: 400,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdStyle}><span style={{ color: "#e8e8f5", fontWeight: 600 }}>{m.symbol}</span></td>
                      <td style={tdStyle}>
                        <span style={{ color: (state as any).isLong !== false ? "#00d97e" : "#ff4560", fontWeight: 700, fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.06em" }}>
                          {(state as any).isLong !== false ? "▲ LONG" : "▼ SHORT"}
                        </span>
                      </td>
                      <td style={tdStyle}><CipherText revealed={false} value="sealed" length={9} style={{ fontSize: 10 }} /></td>
                      <td style={tdStyle}>
                        <span style={{ color: "#e8e8f5" }}>{(state as any).collateral ?? "–"} <span style={{ color: "rgba(232,232,245,0.4)" }}>USDC</span></span>
                      </td>
                      <td style={tdStyle}><CipherText revealed={false} value="sealed" length={10} style={{ fontSize: 10 }} /></td>
                      <td style={tdStyle}>
                        <motion.span key={m.price}
                          initial={{ color: m.up ? "#00d97e" : "#ff4560" }}
                          animate={{ color: "rgba(232,232,245,0.75)" }}
                          transition={{ duration: 0.6 }}
                          style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                        >
                          ${m.price.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}
                        </motion.span>
                      </td>
                      <td style={tdStyle}><CipherText revealed={false} value="sealed" length={10} style={{ fontSize: 10 }} /></td>
                      <td style={tdStyle}><CipherText revealed={false} value="sealed" length={8} style={{ fontSize: 10 }} /></td>
                      <td style={tdStyle}>
                        <StatusPill status={state.status} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        {state.status === "open" && (
                          <span style={{ display: "inline-flex", gap: 5 }}>
                            <motion.button
                              onClick={() => onCheckLiquidation(m.price, 500)}
                              disabled={loading}
                              whileHover={!loading ? { background: "rgba(245,158,11,0.2)" } : {}}
                              whileTap={!loading ? { scale: 0.97 } : {}}
                              style={{
                                padding: "3px 8px", borderRadius: 4,
                                background: "rgba(245,158,11,0.08)",
                                border: "1px solid rgba(245,158,11,0.3)",
                                color: loading ? "rgba(245,158,11,0.3)" : "#f59e0b",
                                fontFamily: "var(--mono)", fontSize: 8,
                                letterSpacing: "0.07em", cursor: loading ? "not-allowed" : "pointer",
                                transition: "all 0.15s",
                              }}
                            >
                              verify liq.
                            </motion.button>
                            <motion.button
                              onClick={() => onClose(m.price)}
                              disabled={loading}
                              whileHover={!loading ? { background: "rgba(34,211,238,0.2)" } : {}}
                              whileTap={!loading ? { scale: 0.97 } : {}}
                              style={{
                                padding: "3px 8px", borderRadius: 4,
                                background: "rgba(34,211,238,0.08)",
                                border: "1px solid rgba(34,211,238,0.3)",
                                color: loading ? "rgba(34,211,238,0.3)" : "#22d3ee",
                                fontFamily: "var(--mono)", fontSize: 8,
                                letterSpacing: "0.07em", cursor: loading ? "not-allowed" : "pointer",
                                transition: "all 0.15s",
                              }}
                            >
                              close · pnl
                            </motion.button>
                          </span>
                        )}
                        {state.status === "checking" && (
                          <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(245,158,11,0.55)", letterSpacing: "0.07em" }}>
                            verifying…
                          </span>
                        )}
                        {state.status === "closing" && (
                          <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(34,211,238,0.55)", letterSpacing: "0.07em" }}>
                            computing…
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : isClosed ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ padding: "16px 14px", display: "flex", alignItems: "center", gap: 16 }}
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(232,232,245,0.5)" }}>position settled —</span>
                  <motion.span
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 18 }}
                    style={{
                      fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700,
                      color: (state as any).isProfit ? "#00d97e" : "#ff4560",
                      textShadow: (state as any).isProfit ? "0 0 18px rgba(0,217,126,0.35)" : "0 0 18px rgba(255,69,96,0.35)",
                    }}
                  >
                    {(state as any).isProfit ? "+" : "−"}{(state as any).pnl ?? "0"} <span style={{ fontSize: 10, opacity: 0.6 }}>USDC</span>
                  </motion.span>
                </motion.div>
              ) : isLiq ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ padding: "16px 14px", display: "flex", alignItems: "center", gap: 10 }}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "#ff4560", letterSpacing: "0.1em" }}
                  >
                    ✕ POSITION LIQUIDATED
                  </motion.span>
                </motion.div>
              ) : (
                <div style={{ padding: "20px 14px", fontFamily: "var(--mono)", fontSize: 10, color: "rgba(232,232,245,0.25)" }}>
                  no open positions
                </div>
              )}
            </motion.div>
          )}

          {tab === "trades" && (
            <motion.div key="trades" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["time", "price", "size", "side"].map((h) => (
                      <th key={h} style={{ padding: "6px 14px", fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.32)", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "left", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_TRADES.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.025)" }}>
                      <td style={tdStyle}>{t.time}</td>
                      <td style={{ ...tdStyle, color: t.side === "buy" ? "#00d97e" : "#ff4560", fontWeight: 600 }}>{t.price}</td>
                      <td style={tdStyle}>{t.size}</td>
                      <td style={{ ...tdStyle, color: t.side === "buy" ? "#00d97e" : "#ff4560", fontWeight: 700, letterSpacing: "0.06em" }}>
                        {t.side.toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}

          {tab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {history.length === 0 ? (
                <div style={{ padding: "20px 14px", fontFamily: "var(--mono)", fontSize: 10, color: "rgba(232,232,245,0.25)", lineHeight: 1.7 }}>
                  sealed positions remain private until close.<br />
                  history will appear here after your first settled trade.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {["closed", "market", "side", "collateral", "entry", "exit", "pnl", "tx"].map((h) => (
                        <th key={h} style={{ padding: "6px 14px", fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.32)", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "left", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h: HistoryEntry, i) => {
                      const dt = new Date(h.ts);
                      const stamp = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                      const sign = h.isProfit ? "+" : "−";
                      const color = h.isProfit ? "#00d97e" : "#ff4560";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.025)" }}>
                          <td style={tdStyle}>{stamp}</td>
                          <td style={{ ...tdStyle, color: "#e8e8f5", fontWeight: 600 }}>{h.market}</td>
                          <td style={{ ...tdStyle, color: h.side === "long" ? "#00d97e" : "#ff4560", fontWeight: 700, letterSpacing: "0.06em" }}>
                            {h.side === "long" ? "▲ LONG" : "▼ SHORT"}
                          </td>
                          <td style={tdStyle}>{h.collateral.toFixed(2)} <span style={{ color: "rgba(232,232,245,0.4)" }}>USDC</span></td>
                          <td style={tdStyle}>${h.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={tdStyle}>${h.exitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ ...tdStyle, color, fontWeight: 700 }}>{sign}{h.pnl.toFixed(2)} USDC</td>
                          <td style={tdStyle}>
                            <a href={`https://explorer.solana.com/tx/${h.txSig}?cluster=devnet`} target="_blank" rel="noreferrer"
                               style={{ color: "rgba(124,58,237,0.7)", textDecoration: "none", fontSize: 9 }}>
                              {h.txSig.slice(0, 6)}…{h.txSig.slice(-4)} ↗
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}


function StatusPill({ status }: { status: string }) {
  const configs: Record<string, { color: string; bg: string; label: string; pulse: boolean }> = {
    open:       { color: "#00d97e", bg: "rgba(0,217,126,0.1)",  label: "OPEN",       pulse: false },
    checking:   { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "VERIFYING",  pulse: true  },
    closing:    { color: "#9b5cf6", bg: "rgba(124,58,237,0.1)", label: "COMPUTING",  pulse: true  },
    liquidated: { color: "#ff4560", bg: "rgba(255,69,96,0.1)",  label: "LIQUIDATED", pulse: false },
    closed:     { color: "rgba(232,232,245,0.4)", bg: "rgba(255,255,255,0.04)", label: "SETTLED", pulse: false },
    default:    { color: "rgba(232,232,245,0.4)", bg: "rgba(255,255,255,0.04)", label: status.toUpperCase(), pulse: false },
  };
  const c = configs[status] ?? configs.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--mono)", fontSize: 8,
      color: c.color, background: c.bg,
      border: `1px solid ${c.color}30`, borderRadius: 3,
      padding: "2px 7px", letterSpacing: "0.08em",
    }}>
      {c.pulse && (
        <motion.span
          style={{ width: 4, height: 4, borderRadius: "50%", background: c.color, display: "inline-block" }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
      {c.label}
    </span>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "9px 14px",
  fontFamily: "var(--mono)", fontSize: 10,
  color: "rgba(232,232,245,0.65)",
  borderBottom: "1px solid rgba(255,255,255,0.03)",
};
