import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const GUIDE_STEPS = [
  {
    n: "01",
    title: "get devnet SOL",
    detail: "visit faucet.solana.com · paste your wallet · need ≥ 0.05 SOL",
    color: "#f59e0b",
  },
  {
    n: "02",
    title: "mint sUSDC",
    detail: "connect wallet → funds tab → mint 10,000 sUSDC",
    color: "#a78bfa",
  },
  {
    n: "03",
    title: "deposit",
    detail: "still in funds tab → enter amount → deposit to protocol",
    color: "#9b5cf6",
  },
  {
    n: "04",
    title: "seal a position",
    detail: "open tab → pick long / short · leverage · collateral → seal",
    color: "#22d3ee",
  },
];

interface Props {
  visible:   boolean;
  onConnect: () => void;
  onDismiss: () => void;
}

// Scrambles then resolves to target string, character by character
function useScramble(target: string, active: boolean, speed = 42) {
  const CHARS = "01アイウエオカキクケコ一二三四五六七八九十░▒▓█▄▀";
  const [display, setDisplay] = useState(() => Array.from({ length: target.length }, () => " "));
  const settled = useRef(0);
  const scramble = useRef<ReturnType<typeof setInterval> | null>(null);
  const settle   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) return;
    settled.current = 0;

    scramble.current = setInterval(() => {
      setDisplay((p) =>
        p.map((c, i) =>
          i < settled.current ? target[i] : CHARS[Math.floor(Math.random() * CHARS.length)]
        )
      );
    }, 40);

    setTimeout(() => {
      settle.current = setInterval(() => {
        if (settled.current >= target.length) {
          clearInterval(settle.current!);
          clearInterval(scramble.current!);
          return;
        }
        settled.current += 1;
      }, speed);
    }, 600);

    return () => {
      clearInterval(scramble.current!);
      clearInterval(settle.current!);
    };
  }, [active, target, speed]);

  return display.join("");
}

function ScrambleWord({ word, delay, size, color }: { word: string; delay: number; size: number; color: string }) {
  const [go, setGo] = useState(false);
  const text = useScramble(word, go);
  useEffect(() => {
    const t = setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: size, color, letterSpacing: "0.06em" }}>
      {text}
    </span>
  );
}

// Cascading hex grid — the "data being encrypted" visual
function CipherGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const W = cv.width = 480;
    const H = cv.height = 56;
    const COLS = 60;
    const drops: number[] = Array.from({ length: COLS }, () => Math.random() * H);
    const chars = "0123456789ABCDEF";
    let raf: number;

    function draw() {
      ctx.fillStyle = "rgba(3,3,8,0.18)";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < COLS; i++) {
        const x = i * (W / COLS);
        const char = chars[Math.floor(Math.random() * chars.length)];
        const prog = drops[i] / H;
        const alpha = prog < 0.3 ? prog / 0.3 * 0.6 : (1 - (prog - 0.3) / 0.7) * 0.6;
        ctx.fillStyle = `rgba(124,58,237,${alpha})`;
        ctx.font = `9px "Space Mono",monospace`;
        ctx.fillText(char, x, drops[i]);
        drops[i] += 1.1 + Math.random() * 0.8;
        if (drops[i] > H + 12) drops[i] = -12;
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas ref={canvasRef} width={480} height={56}
      style={{ width: "100%", height: 56, display: "block", opacity: 0.9 }} />
  );
}

// Horizontal scan line that sweeps across the stats
function ScanLine() {
  return (
    <motion.div
      animate={{ x: ["-100%", "200%"] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 1.4 }}
      style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: "30%",
        background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.08), transparent)",
        pointerEvents: "none",
      }}
    />
  );
}

const STATS = [
  { value: "0×",    label: "on-chain\nexposure" },
  { value: "MPC",   label: "multi-party\ncomputation" },
  { value: "50×",   label: "max\nleverage" },
];

export function WelcomeModal({ visible, onConnect, onDismiss }: Props) {
  const [phase, setPhase] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!visible) { setPhase(0); return; }
    const t = setTimeout(() => setPhase(1), 120);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            position: "fixed", inset: 0, zIndex: 800,
            background: "rgba(3,3,8,0.97)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {/* Dot grid texture */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />

          {/* Side accent lines */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute", left: 40, top: "10%", bottom: "10%", width: 1,
              background: "linear-gradient(to bottom, transparent, rgba(124,58,237,0.4), transparent)",
              transformOrigin: "top",
            }}
          />
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute", right: 40, top: "10%", bottom: "10%", width: 1,
              background: "linear-gradient(to bottom, transparent, rgba(124,58,237,0.4), transparent)",
              transformOrigin: "top",
            }}
          />

          {/* Content */}
          <div style={{ width: "100%", maxWidth: 500, padding: "0 32px", position: "relative" }}>

            {/* Top label */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}
            >
              <ShuuMark />
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#f0f0f5", letterSpacing: "-0.02em" }}>
                  shuu
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 7.5, color: "rgba(124,58,237,0.55)", letterSpacing: "0.25em", textTransform: "uppercase", marginTop: 1 }}>
                  silent perpetuals · arcium
                </div>
              </div>
            </motion.div>

            {/* Hero headline */}
            <div style={{ marginBottom: 10, overflow: "hidden" }}>
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "clamp(52px, 9vw, 72px)",
                  fontWeight: 900,
                  lineHeight: 0.9,
                  letterSpacing: "-0.04em",
                  color: "#f0f0f5",
                }}>
                  TRADE
                </div>
              </motion.div>
            </div>
            <div style={{ marginBottom: 24, overflow: "hidden" }}>
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.38, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "clamp(52px, 9vw, 72px)",
                  fontWeight: 900,
                  lineHeight: 0.9,
                  letterSpacing: "-0.04em",
                  color: "transparent",
                  WebkitTextStroke: "1px rgba(124,58,237,0.7)",
                }}>
                  UNSEEN.
                </div>
              </motion.div>
            </div>

            {/* Subline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              style={{
                fontFamily: "var(--sans)", fontSize: 13,
                color: "rgba(240,240,245,0.52)",
                lineHeight: 1.65, margin: "0 0 22px",
              }}
            >
              Every other DEX writes your entry price, size and direction on-chain — visible to everyone. shuu encrypts them before the tx is signed. The chain sees nothing but ciphertext.
            </motion.p>

            {/* Cipher grid */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              style={{
                marginBottom: 24, border: "1px solid rgba(124,58,237,0.15)",
                borderRadius: 6, overflow: "hidden", position: "relative",
                background: "rgba(3,3,8,0.8)",
              }}
            >
              <CipherGrid />
              {/* Overlaid resolved text */}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, background: "linear-gradient(90deg, rgba(3,3,8,0.7), rgba(3,3,8,0.3), rgba(3,3,8,0.7))",
              }}>
                {phase === 1 && ["POSITION", "SEALED", "ON-CHAIN"].map((w, i) => (
                  <ScrambleWord key={w} word={w} delay={i * 340} size={11} color={i === 1 ? "#9b5cf6" : "rgba(240,240,245,0.55)"} />
                ))}
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
              style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                marginBottom: 24, position: "relative", overflow: "hidden",
              }}
            >
              <ScanLine />
              {STATS.map(({ value, label }, i) => (
                <div key={value} style={{
                  padding: "14px 0 14px 16px",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.07)" : "none",
                }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "#f0f0f5", letterSpacing: "-0.02em", marginBottom: 4 }}>
                    {value}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(240,240,245,0.35)", letterSpacing: "0.1em", whiteSpace: "pre-line", textTransform: "uppercase" }}>
                    {label}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.88 }}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <motion.button
                onClick={onConnect}
                whileHover={{ background: "rgba(124,58,237,0.22)" }}
                whileTap={{ scale: 0.99 }}
                style={{
                  width: "100%", padding: "15px 0",
                  background: "rgba(124,58,237,0.14)",
                  border: "1px solid rgba(124,58,237,0.45)",
                  borderRadius: 4,
                  color: "#c4b5fd",
                  fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.22em", textTransform: "uppercase",
                  cursor: "pointer", transition: "background 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M7 3l3 3-3 3" stroke="#c4b5fd" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                connect wallet
              </motion.button>

              <button
                onClick={onDismiss}
                style={{
                  width: "100%", padding: "12px 0",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  color: "rgba(240,240,245,0.28)",
                  fontFamily: "var(--mono)", fontSize: 9,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  cursor: "pointer", transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(240,240,245,0.5)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(240,240,245,0.28)")}
              >
                explore terminal
              </button>
            </motion.div>

            {/* Getting-started guide */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
              style={{ marginTop: 18 }}
            >
              <button
                onClick={() => setShowGuide((x) => !x)}
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  color: "rgba(240,240,245,0.38)",
                  fontFamily: "var(--mono)", fontSize: 8,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(240,240,245,0.6)"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(240,240,245,0.38)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              >
                <span>new here? how to start</span>
                <span style={{ opacity: 0.5 }}>{showGuide ? "▲" : "▼"}</span>
              </button>

              <AnimatePresence>
                {showGuide && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{
                      marginTop: 6, padding: "12px 14px",
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 4,
                      display: "flex", flexDirection: "column", gap: 10,
                    }}>
                      {GUIDE_STEPS.map((step) => (
                        <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <span style={{
                            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                            color: step.color, letterSpacing: "0.06em", flexShrink: 0,
                            lineHeight: 1.5,
                          }}>
                            {step.n}
                          </span>
                          <div>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, color: "#e8e8f5", marginBottom: 2, letterSpacing: "0.04em" }}>
                              {step.title}
                            </div>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(240,240,245,0.42)", letterSpacing: "0.04em", lineHeight: 1.5 }}>
                              {step.detail}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div style={{
                        marginTop: 4, paddingTop: 8,
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        fontFamily: "var(--mono)", fontSize: 7.5,
                        color: "rgba(124,58,237,0.55)", letterSpacing: "0.1em",
                        textAlign: "center",
                      }}>
                        close &amp; reveal pnl actions live in the positions panel at the bottom
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A distinctive mark — two arcs forming a flowing S, representing "shuu" and silence
function ShuuMark() {
  return (
    <motion.svg
      width="36" height="36" viewBox="0 0 36 36" fill="none"
      animate={{ filter: ["drop-shadow(0 0 4px rgba(124,58,237,0.3))", "drop-shadow(0 0 10px rgba(124,58,237,0.6))", "drop-shadow(0 0 4px rgba(124,58,237,0.3))"] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Outer square — not a hexagon */}
      <rect x="2" y="2" width="32" height="32" rx="6"
        stroke="url(#squareGrad)" strokeWidth="1.2" fill="rgba(124,58,237,0.06)" />

      {/* The mark: a flowing S-curve — 2 clean bezier arcs */}
      <path
        d="M13 13.5 C13 11.5 15 10 18 10 C21 10 23 11.5 23 13.5 C23 15.5 21 17 18 17 C15 17 13 18.5 13 20.5 C13 22.5 15 24 18 24 C21 24 23 22.5 23 20.5"
        stroke="url(#sGrad)" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />

      {/* Two dots — start and end points, suggest the sealed endpoints of a trade */}
      <circle cx="13" cy="13.5" r="1.5" fill="#22d3ee" opacity="0.85" />
      <circle cx="23" cy="20.5" r="1.5" fill="#9b5cf6" opacity="0.85" />

      <defs>
        <linearGradient id="squareGrad" x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="sGrad" x1="13" y1="10" x2="23" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#9b5cf6" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}
