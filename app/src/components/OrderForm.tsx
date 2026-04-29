import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMarkets } from "../context/MarketContext";
import { LogoMark } from "./Logo";

interface Props {
  onOpen:        (collateral: number, entryPrice: number, size: number, isLong: boolean) => void;
  onFaucet:      () => void;
  onDeposit:     (amount: number) => void;
  onWithdraw:    (amount: number) => void;
  hasPosition:   boolean;
  isLiquidated:  boolean;
  loading:       boolean;
  availableUsdc: number;
}

type Tab = "open" | "wallet";

function liqPrice(entry: number, collateral: number, size: number, isLong: boolean) {
  if (!size || !entry) return 0;
  const notional   = size * entry;
  const marginRatio = collateral / notional;
  const dist = entry * Math.max(marginRatio - 0.05, 0.001);
  return isLong ? entry - dist : entry + dist;
}

function estPnl(entry: number, target: number, size: number, isLong: boolean) {
  if (!size || !target) return 0;
  const diff = isLong ? target - entry : entry - target;
  return diff * size;
}

export function OrderForm({ onOpen, onFaucet, onDeposit, onWithdraw, hasPosition, isLiquidated, loading, availableUsdc }: Props) {
  const { current: m } = useMarkets();
  const dp = m.base === "BTC" || m.base === "ETH" ? 2 : 3;

  const [tab, setTab]               = useState<Tab>(() => availableUsdc === 0 && !hasPosition ? "wallet" : "open");
  const [depositAmt, setDepositAmt] = useState("1000");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [isLong, setIsLong]   = useState(true);
  const [collateral, setCol]  = useState("500");
  const [leverage, setLev]    = useState(10);
  const [tpPrice, setTp]      = useState("");
  const [slPrice, setSl]      = useState("");
  const [showTpSl, setShowTpSl] = useState(false);
  const [sealing, setSealing] = useState(false);

  const entry    = m.price;
  const size     = (+collateral * leverage) / entry;
  const notional = +collateral * leverage;
  const liq      = liqPrice(entry, +collateral, size, isLong);
  const tpPnl    = tpPrice ? estPnl(entry, +tpPrice, size, isLong) : null;
  const slPnl    = slPrice ? estPnl(entry, +slPrice, size, isLong) : null;
  const fee      = notional * 0.00006;

  const canOpen  = !hasPosition && !isLiquidated && !loading;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const handleSeal = async () => {
    if (!canOpen) return;
    setSealing(true);
    await onOpen(+collateral, entry, size, isLong);
    setSealing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        {(["open", "wallet"] as Tab[]).map((t) => {
          const label = t === "open" ? "open" : "funds";
          const showDot = t === "wallet" && availableUsdc === 0 && !hasPosition;
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "10px 0", position: "relative",
                background: tab === t ? "rgba(124,58,237,0.09)" : "transparent",
                borderBottom: `2px solid ${tab === t ? "#7c3aed" : "transparent"}`,
                borderTop: "none", borderLeft: "none", borderRight: "none",
                color: tab === t ? "#b08ff5" : "rgba(232,232,245,0.38)",
                fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em",
                textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {label}
              {showDot && (
                <span style={{
                  position: "absolute", top: 7, right: "calc(50% - 18px)",
                  width: 5, height: 5, borderRadius: "50%",
                  background: "#f59e0b", display: "inline-block",
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ══ OPEN TAB ══ */}
        {tab === "open" && (
          <>
            {/* Existing-position callout (v1: one position per trader) */}
            {hasPosition && (
              <div style={{
                margin: "12px 14px 0", padding: "11px 13px",
                background: "rgba(124,58,237,0.08)", borderRadius: 7,
                border: "1px solid rgba(124,58,237,0.3)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <LockIcon color="#a78bfa" />
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "#a78bfa", letterSpacing: "0.1em", marginBottom: 3 }}>
                    POSITION ACTIVE
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(232,232,245,0.55)" }}>
                    v1 supports one open position at a time. Close the active trade in the positions panel to open a new one.
                  </div>
                </div>
              </div>
            )}

            {/* No funds callout */}
            {availableUsdc === 0 && !hasPosition && (
              <div style={{
                margin: "12px 14px 0", padding: "11px 13px",
                background: "rgba(245,158,11,0.06)", borderRadius: 7,
                border: "1px solid rgba(245,158,11,0.2)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>◎</span>
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "#f59e0b", letterSpacing: "0.1em", marginBottom: 3 }}>
                    NO BALANCE
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(232,232,245,0.45)" }}>
                    Go to{" "}
                    <button onClick={() => setTab("wallet")} style={{
                      background: "none", border: "none", padding: 0,
                      color: "#a78bfa", fontFamily: "var(--mono)", fontSize: 9,
                      cursor: "pointer", textDecoration: "underline",
                    }}>funds</button>
                    {" "}to mint devnet sUSDC and deposit
                  </div>
                </div>
              </div>
            )}

            {/* Scrollable inputs */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 4px", minHeight: 0 }}>

              {/* Long / Short */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                {([true, false] as const).map((side) => (
                  <motion.button key={String(side)}
                    onClick={() => setIsLong(side)}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      padding: "12px 0", borderRadius: 7,
                      background: isLong === side
                        ? side ? "rgba(0,217,126,0.14)" : "rgba(255,69,96,0.14)"
                        : "rgba(255,255,255,0.03)",
                      border: `1.5px solid ${isLong === side
                        ? side ? "rgba(0,217,126,0.5)" : "rgba(255,69,96,0.5)"
                        : "rgba(255,255,255,0.07)"}`,
                      color: isLong === side
                        ? side ? "#00d97e" : "#ff4560"
                        : "rgba(232,232,245,0.35)",
                      fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                      letterSpacing: "0.1em", cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {side ? "▲  LONG" : "▼  SHORT"}
                  </motion.button>
                ))}
              </div>

              {/* Collateral */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <FieldLabel>Collateral</FieldLabel>
                  {availableUsdc !== null && availableUsdc !== undefined && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.35)", letterSpacing: "0.06em" }}>
                      avail: <span style={{ color: "rgba(232,232,245,0.6)" }}>${availableUsdc.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                    </span>
                  )}
                </div>
                <NumInput value={collateral} onChange={setCol} suffix="USDC" />
                <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                  {["100", "250", "500", "1000"].map((v) => (
                    <button key={v} onClick={() => setCol(v)}
                      style={{
                        flex: 1, padding: "4px 0", borderRadius: 5,
                        background: collateral === v ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${collateral === v ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.06)"}`,
                        color: collateral === v ? "#b08ff5" : "rgba(232,232,245,0.4)",
                        fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", transition: "all 0.15s",
                      }}
                    >${v}</button>
                  ))}
                </div>
              </div>

              {/* Leverage */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <FieldLabel>Leverage</FieldLabel>
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700,
                    color: leverage >= 25 ? "#f59e0b" : "#9b5cf6",
                  }}>
                    {leverage}×
                  </span>
                </div>
                <input type="range" min={1} max={50} step={1} value={leverage}
                  onChange={(e) => setLev(+e.target.value)}
                  style={{ width: "100%", "--val": `${(leverage / 50) * 100}%` } as React.CSSProperties}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {[2, 5, 10, 25, 50].map((v) => (
                    <button key={v} onClick={() => setLev(v)}
                      style={{
                        flex: 1, padding: "3px 0", borderRadius: 5,
                        background: leverage === v ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${leverage === v ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)"}`,
                        color: leverage === v ? "#b08ff5" : "rgba(232,232,245,0.4)",
                        fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", transition: "all 0.15s",
                      }}
                    >{v}×</button>
                  ))}
                </div>
              </div>

              {/* TP / SL */}
              <div style={{ marginBottom: 4 }}>
                <button
                  onClick={() => setShowTpSl((x) => !x)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, width: "100%",
                    padding: "7px 10px", borderRadius: 6,
                    background: showTpSl ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.025)",
                    border: `1px solid ${showTpSl ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)"}`,
                    color: showTpSl ? "#b08ff5" : "rgba(232,232,245,0.45)",
                    fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.1em",
                    textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>TP / SL</span>
                  <span style={{ opacity: 0.45, fontSize: 8 }}>{showTpSl ? "▲" : "▼"}</span>
                </button>

                <AnimatePresence>
                  {showTpSl && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 7 }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <FieldLabel>Take Profit</FieldLabel>
                            {tpPnl !== null && (
                              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: tpPnl >= 0 ? "#00d97e" : "#ff4560", fontWeight: 700 }}>
                                {tpPnl >= 0 ? "+" : ""}${Math.abs(tpPnl).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <NumInput value={tpPrice} onChange={setTp} suffix="USD"
                            placeholder={`${(entry * (isLong ? 1.05 : 0.95)).toFixed(dp)}`} />
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <FieldLabel>Stop Loss</FieldLabel>
                            {slPnl !== null && (
                              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "#ff4560", fontWeight: 700 }}>
                                −${Math.abs(slPnl).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <NumInput value={slPrice} onChange={setSl} suffix="USD"
                            placeholder={`${(entry * (isLong ? 0.97 : 1.03)).toFixed(dp)}`} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {/* ── Fixed footer — always visible ── */}
            <div style={{
              flexShrink: 0, padding: "10px 14px 14px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(0,0,0,0.18)",
            }}>
              {/* Order summary */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 9 }}>
                <SummaryRow label="entry"       value={`$${fmt(entry)}`} />
                <SummaryRow label="size"        value={`${size.toFixed(4)} ${m.base}`} />
                <SummaryRow label="notional"    value={`$${notional.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
                <SummaryRow label="liq. price"  value={`$${fmt(liq)}`} color={isLong ? "#ff4560" : "#00d97e"} />
                <SummaryRow label="fees"        value={`~$${fee.toFixed(2)}`} />
                {tpPnl !== null && <SummaryRow label="est. TP profit" value={`+$${Math.abs(tpPnl).toFixed(2)}`} color="#00d97e" />}
                {slPnl !== null && <SummaryRow label="max SL loss"    value={`-$${Math.abs(slPnl).toFixed(2)}`}  color="#ff4560" />}
              </div>

              {/* Privacy badge */}
              <div style={{
                marginBottom: 10, padding: "5px 9px",
                background: "rgba(124,58,237,0.08)", borderRadius: 5,
                border: "1px solid rgba(124,58,237,0.2)",
                display: "flex", alignItems: "center", gap: 7,
              }}>
                <LockIcon />
                <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, color: "#a78bfa", letterSpacing: "0.06em" }}>
                  x25519 encrypted · arcium mxe sealed · on-chain: ciphertext only
                </span>
              </div>

              {/* SEAL button */}
              <motion.button
                onClick={handleSeal}
                disabled={!canOpen}
                whileHover={canOpen ? {
                  boxShadow: isLong
                    ? "0 0 32px rgba(0,217,126,0.22)"
                    : "0 0 32px rgba(255,69,96,0.22)",
                } : {}}
                whileTap={canOpen ? { scale: 0.98 } : {}}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 9,
                  background: !canOpen
                    ? "rgba(255,255,255,0.04)"
                    : isLong
                    ? "linear-gradient(135deg, rgba(0,217,126,0.2), rgba(0,217,126,0.07))"
                    : "linear-gradient(135deg, rgba(255,69,96,0.2), rgba(255,69,96,0.07))",
                  border: `1.5px solid ${!canOpen
                    ? "rgba(255,255,255,0.06)"
                    : isLong ? "rgba(0,217,126,0.5)" : "rgba(255,69,96,0.5)"}`,
                  color: !canOpen ? "rgba(232,232,245,0.2)" : isLong ? "#00d97e" : "#ff4560",
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  cursor: !canOpen ? "not-allowed" : "pointer",
                  opacity: !canOpen ? 0.45 : 1, transition: "all 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}
              >
                {loading || sealing ? (
                  <SealingSpinner color={isLong ? "#00d97e" : "#ff4560"} />
                ) : (
                  <>
                    <LogoMark size={15} sealing={sealing} />
                    seal position
                  </>
                )}
              </motion.button>
            </div>
          </>
        )}

        {/* ══ WALLET TAB ══ */}
        {tab === "wallet" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", minHeight: 0 }}>

            {/* Balance summary */}
            <div style={{
              padding: "12px 14px", marginBottom: 14,
              background: "rgba(124,58,237,0.07)", borderRadius: 8,
              border: "1px solid rgba(124,58,237,0.2)",
            }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.4)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                protocol balance
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "#e8e8f5" }}>
                {availableUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span style={{ fontSize: 11, color: "rgba(232,232,245,0.4)", marginLeft: 6 }}>sUSDC</span>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.3)", marginTop: 4 }}>
                available for trading
              </div>
            </div>

            {/* Faucet */}
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.38)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                faucet · devnet
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(232,232,245,0.45)", marginBottom: 10 }}>
                Mint 10,000 sUSDC to your wallet (once per call)
              </div>
              <ActionBtn
                label="mint 10,000 sUSDC"
                disabled={loading} loading={loading}
                color="#a78bfa" glow="rgba(124,58,237,0.2)"
                onClick={onFaucet}
              />
            </div>

            {/* Deposit */}
            <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.38)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                deposit sUSDC
              </div>
              <NumInput value={depositAmt} onChange={setDepositAmt} suffix="sUSDC" />
              <div style={{ display: "flex", gap: 5, marginTop: 6, marginBottom: 10 }}>
                {["500", "1000", "5000", "10000"].map((v) => (
                  <button key={v} onClick={() => setDepositAmt(v)}
                    style={{
                      flex: 1, padding: "4px 0", borderRadius: 5,
                      background: depositAmt === v ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${depositAmt === v ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.06)"}`,
                      color: depositAmt === v ? "#b08ff5" : "rgba(232,232,245,0.4)",
                      fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", transition: "all 0.15s",
                    }}
                  >{v}</button>
                ))}
              </div>
              <ActionBtn
                label="deposit"
                disabled={loading || !depositAmt || +depositAmt <= 0} loading={loading}
                color="#00d97e" glow="rgba(0,217,126,0.15)"
                onClick={() => onDeposit(+depositAmt)}
              />
            </div>

            {/* Withdraw */}
            <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.38)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                withdraw sUSDC
              </div>
              <NumInput value={withdrawAmt} onChange={setWithdrawAmt} suffix="sUSDC" placeholder={availableUsdc.toFixed(2)} />
              <div style={{ marginTop: 6, marginBottom: 10 }}>
                <button
                  onClick={() => setWithdrawAmt(availableUsdc.toFixed(2))}
                  style={{
                    padding: "4px 10px", borderRadius: 5,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(232,232,245,0.4)", fontFamily: "var(--mono)", fontSize: 9,
                    cursor: "pointer",
                  }}
                >max</button>
              </div>
              <ActionBtn
                label="withdraw"
                disabled={loading || !withdrawAmt || +withdrawAmt <= 0 || +withdrawAmt > availableUsdc} loading={loading}
                color="#22d3ee" glow="rgba(34,211,238,0.15)"
                onClick={() => onWithdraw(+withdrawAmt)}
              />
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "block", fontFamily: "var(--mono)", fontSize: 9,
      color: "rgba(232,232,245,0.45)", letterSpacing: "0.12em",
      textTransform: "uppercase", marginBottom: 6,
    }}>
      {children}
    </span>
  );
}

function NumInput({ value, onChange, suffix, placeholder }: {
  value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 7, padding: "0 12px", transition: "border 0.15s",
    }}
      onFocusCapture={(e) => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.55)")}
      onBlurCapture={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
    >
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, padding: "10px 0", fontSize: 14, background: "transparent",
          border: "none", color: "#e8e8f5", fontFamily: "var(--mono)",
        }} />
      {suffix && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(232,232,245,0.4)", letterSpacing: "0.08em" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(232,232,245,0.38)", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: color ?? "rgba(232,232,245,0.8)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ActionBtn({ label, disabled, loading, color, glow, onClick }: {
  label: string; disabled: boolean; loading: boolean;
  color: string; glow: string; onClick: () => void;
}) {
  return (
    <motion.button onClick={onClick} disabled={disabled}
      whileHover={!disabled ? { boxShadow: `0 0 24px ${glow}` } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      style={{
        width: "100%", padding: "12px 0", borderRadius: 8,
        background: disabled ? "rgba(255,255,255,0.04)" : `${color}18`,
        border: `1.5px solid ${disabled ? "rgba(255,255,255,0.06)" : `${color}55`}`,
        color: disabled ? "rgba(232,232,245,0.2)" : color,
        fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
        letterSpacing: "0.14em", textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1, transition: "all 0.15s",
      }}
    >
      {loading ? <SealingSpinner color={color} /> : <span dangerouslySetInnerHTML={{ __html: label }} />}
    </motion.button>
  );
}

function LockIcon({ color = "#7c3aed" }: { color?: string }) {
  return (
    <svg width="10" height="11" viewBox="0 0 10 11" fill="none" style={{ flexShrink: 0, opacity: 0.85 }}>
      <rect x="1.5" y="4.5" width="7" height="5.5" rx="1" stroke={color} strokeWidth="1.2" />
      <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5" cy="7.25" r="0.8" fill={color} />
    </svg>
  );
}

function SealingSpinner({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <motion.span key={i}
          style={{ width: 4, height: 4, borderRadius: "50%", background: color, display: "inline-block" }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.3, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}
