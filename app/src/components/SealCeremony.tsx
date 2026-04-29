import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  active: boolean; // true while position is in encrypting/open state transition
}

// Renders a brief full-screen ceremony when a position is sealed
export function SealCeremony({ active }: Props) {
  const [show, setShow]   = useState(false);
  const [phase, setPhase] = useState<"encrypt" | "done">("encrypt");
  const prevRef = useRef(false);
  const t1 = useRef<ReturnType<typeof setTimeout>>();
  const t2 = useRef<ReturnType<typeof setTimeout>>();

  // Trigger on rising edge only — ceremony always runs its full 2.8s
  useEffect(() => {
    if (active && !prevRef.current) {
      setPhase("encrypt");
      setShow(true);
      t1.current = setTimeout(() => setPhase("done"),  1400);
      t2.current = setTimeout(() => setShow(false),    2800);
    }
    prevRef.current = active;
  }, [active]);

  // Cleanup only on unmount
  useEffect(() => () => { clearTimeout(t1.current); clearTimeout(t2.current); }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="ceremony"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            position: "fixed", inset: 0, zIndex: 900,
            background: "rgba(3,3,8,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <MatrixRain active={show} />

          <div style={{ position: "relative", textAlign: "center" }}>
            <AnimatePresence mode="wait">
              {phase === "encrypt" && (
                <motion.div
                  key="enc"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.06 }}
                  transition={{ duration: 0.3 }}
                >
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "rgba(124,58,237,0.6)", letterSpacing: "0.28em", textTransform: "uppercase", marginBottom: 14 }}>
                    x25519 · arcium mxe
                  </div>
                  <EncryptingText />
                  <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 8 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.div key={i}
                        style={{ width: 3, height: 3, borderRadius: "50%", background: "#7c3aed" }}
                        animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.4, 1] }}
                        transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {phase === "done" && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 22 }}
                >
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 340, damping: 20 }}
                    style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}
                  >
                    <SealBurst />
                  </motion.div>
                  <div style={{
                    fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700,
                    color: "#f0f0f5", letterSpacing: "-0.02em",
                  }}>
                    POSITION SEALED
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(124,58,237,0.6)", letterSpacing: "0.18em", marginTop: 8 }}>
                    on-chain: ciphertext only
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Scrambling ciphertext block
function EncryptingText() {
  const CHARS = "0123456789ABCDEFabcdef░▒▓";
  const rows = 3;
  const cols = 22;
  const [grid, setGrid] = useState(() =>
    Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => CHARS[Math.floor(Math.random() * CHARS.length)])
    )
  );

  useEffect(() => {
    const id = setInterval(() => {
      setGrid((g) =>
        g.map((row) =>
          row.map((c) =>
            Math.random() < 0.35
              ? CHARS[Math.floor(Math.random() * CHARS.length)]
              : c
          )
        )
      );
    }, 55);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ fontFamily: "var(--mono)", display: "inline-block", lineHeight: 1.6 }}>
      {grid.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: 3 }}>
          {row.map((c, i) => {
            const col = (r * cols + i) % 3 === 0
              ? "rgba(124,58,237,0.9)"
              : (r * cols + i) % 7 === 0
              ? "rgba(34,211,238,0.7)"
              : "rgba(240,240,245,0.28)";
            return (
              <span key={i} style={{ fontSize: 13, color: col, transition: "color 0.1s" }}>{c}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Subtle matrix rain columns behind the ceremony
function MatrixRain({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
    const cols = Math.floor(cv.width / 18);
    const drops = Array.from({ length: cols }, () => Math.random() * cv.height);
    const CHARS = "01アイウエオABCDEF▄▀░▒";
    let raf: number;

    function draw() {
      ctx.fillStyle = "rgba(3,3,8,0.1)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < cols; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const alpha = 0.06 + Math.random() * 0.08;
        ctx.fillStyle = `rgba(124,58,237,${alpha})`;
        ctx.font = `13px "Space Mono",monospace`;
        ctx.fillText(char, i * 18, drops[i]);
        drops[i] += 1.4 + Math.random();
        if (drops[i] > cv.height + 20) drops[i] = -20;
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <canvas ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.7 }}
    />
  );
}

// Expanding rings + lock icon that plays on "done"
function SealBurst() {
  return (
    <div style={{ position: "relative", width: 72, height: 72 }}>
      {[0, 1, 2].map((i) => (
        <motion.div key={i}
          initial={{ scale: 0.6, opacity: 0.6 }}
          animate={{ scale: 2.2 + i * 0.5, opacity: 0 }}
          transition={{ duration: 1.0, delay: i * 0.18, repeat: Infinity }}
          style={{
            position: "absolute",
            inset: 0, borderRadius: "50%",
            border: "1px solid rgba(124,58,237,0.4)",
          }}
        />
      ))}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: "rgba(124,58,237,0.12)", border: "1.5px solid rgba(124,58,237,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="4" y="12" width="20" height="14" rx="3" stroke="#9b5cf6" strokeWidth="1.5" />
          <path d="M8.5 12V8.5a5.5 5.5 0 0 1 11 0V12" stroke="#9b5cf6" strokeWidth="1.5" strokeLinecap="round" />
          <motion.path
            d="M10 19l3 3 5-6"
            stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
          />
        </svg>
      </div>
    </div>
  );
}
