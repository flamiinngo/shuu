import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useMarkets } from "../context/MarketContext";

interface Level { price: number; size: number; total: number; flash?: boolean }

function buildSide(mid: number, side: "ask" | "bid", n = 14): Level[] {
  const out: Level[] = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    const step  = mid * 0.00018 * (1 + Math.random() * 0.5);
    const price = side === "ask" ? mid + step * (i + 1) : mid - step * (i + 1);
    const size  = parseFloat((0.03 + Math.random() * 2.2).toFixed(3));
    cum += size;
    out.push({ price, size, total: parseFloat(cum.toFixed(3)) });
  }
  return out;
}

export function OrderBook() {
  const { current: m } = useMarkets();
  const dp = m.base === "BTC" || m.base === "ETH" ? 1 : 3;

  const [asks, setAsks] = useState(() => buildSide(m.price, "ask"));
  const [bids, setBids] = useState(() => buildSide(m.price, "bid"));
  const prevPriceRef = useRef(m.price);

  useEffect(() => {
    const id = setInterval(() => {
      setAsks(buildSide(m.price, "ask"));
      setBids(buildSide(m.price, "bid"));
    }, 800);
    return () => clearInterval(id);
  }, [m.price]);

  const maxTotal = Math.max(
    asks[asks.length - 1]?.total ?? 1,
    bids[bids.length - 1]?.total ?? 1,
  );
  const spread = asks[0] && bids[0] ? (asks[0].price - bids[0].price).toFixed(dp) : "–";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: "7px 12px", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(232,232,245,0.4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          order book
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.3)" }}>
          spread {spread}
        </span>
      </div>

      {/* Column labels */}
      <div style={{
        display: "flex", justifyContent: "space-between", padding: "4px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0,
      }}>
        {["PRICE", "SIZE", "TOTAL"].map((h) => (
          <span key={h} style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(232,232,245,0.3)", letterSpacing: "0.1em" }}>{h}</span>
        ))}
      </div>

      {/* Asks (sell) — reversed, lowest ask closest to mid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column-reverse", overflow: "hidden" }}>
        {asks.slice(0, 11).map((l, i) => (
          <BookRow key={`a${i}`} level={l} side="ask" maxTotal={maxTotal} dp={dp} />
        ))}
      </div>

      {/* Mid price */}
      <div style={{
        padding: "5px 12px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.25)", flexShrink: 0,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <motion.span
          key={m.price}
          initial={{ color: m.up ? "#00d97e" : "#ff4560" }}
          animate={{ color: "#e8e8f5" }}
          transition={{ duration: 0.8 }}
          style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}
        >
          ${m.price.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}
        </motion.span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: m.up ? "rgba(0,217,126,0.7)" : "rgba(255,69,96,0.7)" }}>
          {m.up ? "▲" : "▼"}
        </span>
      </div>

      {/* Bids (buy) */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {bids.slice(0, 11).map((l, i) => (
          <BookRow key={`b${i}`} level={l} side="bid" maxTotal={maxTotal} dp={dp} />
        ))}
      </div>
    </div>
  );
}

function BookRow({ level, side, maxTotal, dp }: {
  level: Level; side: "ask" | "bid"; maxTotal: number; dp: number
}) {
  const pct  = (level.total / maxTotal) * 100;
  const col  = side === "ask" ? "#ff4560" : "#00d97e";
  const bgC  = side === "ask" ? "rgba(255,69,96,0.08)" : "rgba(0,217,126,0.08)";

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.8px 12px" }}>
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        background: bgC, width: `${pct}%`,
        transition: "width 0.3s ease",
      }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: col, position: "relative", letterSpacing: "0.01em" }}>
        {level.price.toFixed(dp)}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(232,232,245,0.7)", position: "relative" }}>
        {level.size.toFixed(3)}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(232,232,245,0.45)", position: "relative" }}>
        {level.total.toFixed(2)}
      </span>
    </div>
  );
}
