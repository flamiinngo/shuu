import { motion, AnimatePresence } from "framer-motion";
import { CipherText } from "./CipherText";
import { useEffect, useRef, useState } from "react";

export type PositionState =
  | { status: "empty" }
  | { status: "encrypting" }
  | { status: "open";       isLong: boolean; collateral: string }
  | { status: "checking" }
  | { status: "liquidated" }
  | { status: "closing" }
  | { status: "closed";     pnl: string; isProfit: boolean };

function StatusDot({ status }: { status: PositionState["status"] }) {
  const colors: Record<string, string> = {
    empty:      "rgba(255,255,255,0.12)",
    encrypting: "#7c3aed",
    open:       "#10b981",
    checking:   "#f59e0b",
    liquidated: "#f43f5e",
    closing:    "#7c3aed",
    closed:     "rgba(255,255,255,0.18)",
  };
  const pulse = ["encrypting", "checking", "closing"].includes(status);
  const c = colors[status];
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8, alignItems: "center", justifyContent: "center" }}>
      {pulse && (
        <motion.span style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `1px solid ${c}`, opacity: 0.5 }}
          animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
      <span style={{ display: "block", width: 7, height: 7, borderRadius: "50%", background: c, position: "relative", zIndex: 1 }} />
    </span>
  );
}

function OrbitalSpinner({ color }: { color: string }) {
  return (
    <div style={{ position: "relative", width: 44, height: 44, margin: "12px auto" }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          border: `1.5px solid ${color}30`,
          borderTopColor: color,
        }}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute", inset: 8,
          borderRadius: "50%",
          border: `1.5px solid ${color}18`,
          borderBottomColor: color,
          opacity: 0.6,
        }}
      />
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, opacity: 0.8 }} />
      </div>
    </div>
  );
}

function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    startRef.current = null;
    function tick(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const prog = Math.min((ts - startRef.current) / duration, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setVal(to * ease);
      if (prog < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration]);

  return <>{val.toFixed(2)}</>;
}

export function PositionCard({ state }: { state: PositionState }) {
  const isOpen = state.status === "open" || state.status === "checking";
  const isLiq  = state.status === "liquidated";
  const isClosed = state.status === "closed";

  const borderColor = isOpen
    ? "rgba(16,185,129,0.22)"
    : isLiq
    ? "rgba(244,63,94,0.22)"
    : isClosed
    ? "rgba(255,255,255,0.1)"
    : "var(--border)";

  const glowColor = isOpen
    ? "rgba(16,185,129,0.04)"
    : isLiq
    ? "rgba(244,63,94,0.04)"
    : "rgba(124,58,237,0.04)";

  return (
    <motion.div
      layout
      style={{
        background:   "rgba(255,255,255,0.025)",
        backdropFilter: "blur(20px)",
        border:       `1px solid ${borderColor}`,
        borderRadius: 18,
        padding:      "26px 28px",
        position:     "relative",
        overflow:     "hidden",
        minHeight:    220,
        transition:   "border-color 0.4s",
      }}
    >
      {/* Corner glow */}
      <div style={{
        position: "absolute", top: -50, right: -50, width: 140, height: 140,
        borderRadius: "50%",
        background: `radial-gradient(circle,${glowColor} 0%,transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
        <StatusDot status={state.status} />
        <span style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)" }}>
          position
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: "0.08em" }}>
          { { empty: "—", encrypting: "sealing", open: "live", checking: "verifying", liquidated: "liquidated", closing: "computing", closed: "settled" }[state.status] }
        </span>
      </div>

      <AnimatePresence mode="wait">

        {state.status === "empty" && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ textAlign: "center", paddingTop: 24 }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: "0 auto 12px", display: "block", opacity: 0.2 }}>
                <path d="M16 3L4 8.5V16C4 22.6 9.6 28.8 16 31C22.4 28.8 28 22.6 28 16V8.5L16 3Z" stroke="#eeeef5" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <div style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)" }}>no open position</div>
            </div>
          </motion.div>
        )}

        {state.status === "encrypting" && (
          <motion.div key="encrypting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <OrbitalSpinner color="#7c3aed" />
            <Row label="collateral"><CipherText revealed={false} value="?" length={10} /></Row>
            <Row label="direction"><CipherText revealed={false} value="?" length={4} /></Row>
            <Row label="entry price"><CipherText revealed={false} value="?" length={14} /></Row>
            <div style={{ marginTop: 16, color: "rgba(124,58,237,0.55)", fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.1em", textAlign: "center" }}>
              encrypting to mxe cluster...
            </div>
          </motion.div>
        )}

        {isOpen && (
          <motion.div key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Row label="collateral">
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text)" }}>
                {(state as { collateral: string }).collateral} <span style={{ color: "var(--muted)", fontSize: 10 }}>USDC</span>
              </span>
            </Row>
            <Row label="direction">
              <span style={{
                fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700,
                color: (state as { isLong?: boolean }).isLong ? "#10b981" : "#f43f5e",
                letterSpacing: "0.1em",
              }}>
                {(state as { isLong?: boolean }).isLong ? "▲ LONG" : "▼ SHORT"}
              </span>
            </Row>
            <Row label="entry price"><CipherText revealed={false} value="?" length={14} style={{ fontSize: 12 }} /></Row>
            <Row label="size"><CipherText revealed={false} value="?" length={10} style={{ fontSize: 12 }} /></Row>
            {state.status === "checking" && (
              <div style={{ marginTop: 14, color: "rgba(245,158,11,0.6)", fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 8 }}>
                <OrbitalSpinner color="#f59e0b" />
                <span>verifying margin ratio...</span>
              </div>
            )}
          </motion.div>
        )}

        {isLiq && (
          <motion.div key="liq" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div style={{ textAlign: "center", paddingTop: 12 }}>
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ fontSize: 28, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--danger)", letterSpacing: "0.05em", marginBottom: 10 }}
              >
                LIQUIDATED
              </motion.div>
              <div style={{ color: "rgba(244,63,94,0.55)", fontSize: 11, fontFamily: "var(--mono)", lineHeight: 1.6 }}>
                margin ratio breached<br/>position closed by the protocol
              </div>
            </div>
          </motion.div>
        )}

        {(state.status === "closing" || state.status === "closed") && (
          <motion.div key="pnl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Row label="realised pnl">
              {state.status === "closing" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CipherText revealed={false} value="?" length={12} />
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 20 }}
                  style={{
                    fontFamily:  "var(--mono)",
                    fontSize:    22,
                    fontWeight:  700,
                    color: (state as { isProfit: boolean }).isProfit ? "var(--gain)" : "var(--loss)",
                    textShadow: (state as { isProfit: boolean }).isProfit
                      ? "0 0 20px rgba(16,185,129,0.4)"
                      : "0 0 20px rgba(244,63,94,0.4)",
                  }}
                >
                  {(state as { isProfit: boolean }).isProfit ? "+" : "−"}
                  <CountUp to={parseFloat((state as { pnl: string }).pnl)} />
                  {" "}
                  <span style={{ fontSize: 11, opacity: 0.6 }}>USDC</span>
                </motion.div>
              )}
            </Row>
            {state.status === "closing" && (
              <div style={{ marginTop: 16 }}>
                <OrbitalSpinner color="#7c3aed" />
                <div style={{ textAlign: "center", marginTop: 8, color: "rgba(124,58,237,0.55)", fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.1em" }}>
                  mxe computing pnl...
                </div>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--mono)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
