import { useEffect, useRef, useState } from "react";

const CHARSET = "0123456789abcdef";

interface Props {
  revealed:  boolean;
  value:     string;       // actual value to reveal
  length?:   number;       // how many scramble chars while hidden
  style?:    React.CSSProperties;
  className?: string;
}

// Shows scrambling hex noise while hidden, then animates to the real value
// character by character when revealed.  The settle-in left-to-right gives
// a satisfying "decrypting" feel without any library.
export function CipherText({ revealed, value, length = 12, style, className }: Props) {
  const [display, setDisplay] = useState<string[]>(
    Array.from({ length }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)])
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef  = useRef(0);

  // Continuous scramble while hidden.
  useEffect(() => {
    if (revealed) return;
    settledRef.current = 0;
    intervalRef.current = setInterval(() => {
      setDisplay(
        Array.from({ length }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)])
      );
    }, 60);
    return () => clearInterval(intervalRef.current!);
  }, [revealed, length]);

  // Settle characters left to right when revealed.
  useEffect(() => {
    if (!revealed) return;
    clearInterval(intervalRef.current!);
    settledRef.current = 0;

    const chars = value.split("");

    settleRef.current = setInterval(() => {
      const idx = settledRef.current;
      if (idx >= chars.length) {
        clearInterval(settleRef.current!);
        return;
      }
      setDisplay((prev) => {
        const next = [...prev];
        // Pad if needed.
        while (next.length < chars.length) next.push(CHARSET[0]);
        next[idx] = chars[idx];
        return next;
      });
      settledRef.current += 1;
    }, 38);

    return () => clearInterval(settleRef.current!);
  }, [revealed, value]);

  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--mono)",
        letterSpacing: "0.05em",
        color: revealed ? "var(--text)" : "rgba(139, 92, 246, 0.55)",
        transition: "color 0.3s",
        ...style,
      }}
    >
      {display.join("")}
    </span>
  );
}
