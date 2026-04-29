import { motion } from "framer-motion";
import { useMarkets } from "../context/MarketContext";

export function StatsBar() {
  const { current: m } = useMarkets();
  const up = m.change24 >= 0;
  const dp = m.base === "BTC" || m.base === "ETH" ? 2 : 3;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const stats = [
    {
      label: "mark",
      value: `$${fmt(m.price)}`,
      color: m.up ? "#00d97e" : "#ff4560",
      large: true,
    },
    {
      label: "24h change",
      value: `${up ? "+" : ""}${m.change24.toFixed(2)}%`,
      color: up ? "#00d97e" : "#ff4560",
    },
    {
      label: "24h high",
      value: `$${fmt(m.high24)}`,
      color: "#e8e8f5",
    },
    {
      label: "24h low",
      value: `$${fmt(m.low24)}`,
      color: "#e8e8f5",
    },
    {
      label: "24h volume",
      value: m.volume24,
      color: "#e8e8f5",
    },
    {
      label: "open interest",
      value: m.oi,
      color: "#e8e8f5",
    },
    {
      label: "funding / 8h",
      value: `${m.funding >= 0 ? "+" : ""}${m.funding.toFixed(4)}%`,
      color: m.funding >= 0 ? "#00d97e" : "#ff4560",
    },
  ];

  return (
    <div style={{
      height: "100%",
      display: "flex", alignItems: "center",
      gap: 0, paddingLeft: 16, overflowX: "auto",
    }}>
      {/* Market name */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingRight: 18, marginRight: 4,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
      }}>
        <motion.div
          style={{ width: 7, height: 7, borderRadius: "50%", background: "#7c3aed" }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#e8e8f5", letterSpacing: "-0.01em" }}>
          {m.symbol.split("-")[0]}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "rgba(124,58,237,0.7)", letterSpacing: "0.16em" }}>
          PERP
        </span>
      </div>

      {stats.map(({ label, value, color, large }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 14px", flexShrink: 0 }}>
          <span style={{
            fontFamily: "var(--mono)", fontSize: 8,
            color: "rgba(232,232,245,0.38)",
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            {label}
          </span>
          <motion.span
            key={value}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            style={{
              fontFamily: "var(--mono)",
              fontSize: large ? 14 : 11,
              fontWeight: 700,
              color,
              letterSpacing: large ? "-0.01em" : "0.01em",
            }}
          >
            {value}
          </motion.span>
        </div>
      ))}
    </div>
  );
}
