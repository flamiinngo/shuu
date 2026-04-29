import { motion } from "framer-motion";
import { useMarkets } from "../context/MarketContext";

export function MarketList() {
  const { markets, selected, setSelected } = useMarkets();

  return (
    <div style={{
      width: 192, minWidth: 192, flexShrink: 0,
      borderRight: "1px solid rgba(255,255,255,0.07)",
      display: "flex", flexDirection: "column",
      background: "rgba(0,0,0,0.15)",
    }}>
      <div style={{
        padding: "10px 14px 8px",
        fontSize: 9, fontFamily: "var(--mono)",
        color: "rgba(232,232,245,0.35)",
        letterSpacing: "0.18em", textTransform: "uppercase",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        markets
      </div>

      {markets.map((m) => {
        const active = m.symbol === selected;
        const up     = m.change24 >= 0;
        const dp     = m.base === "BTC" || m.base === "ETH" ? 2 : 3;

        return (
          <motion.button
            key={m.symbol}
            onClick={() => setSelected(m.symbol)}
            whileHover={{ background: "rgba(255,255,255,0.035)" }}
            style={{
              display: "flex", flexDirection: "column", gap: 4,
              padding: "12px 14px",
              background: active ? "rgba(124,58,237,0.09)" : "transparent",
              borderLeft: `2px solid ${active ? "#7c3aed" : "transparent"}`,
              borderRight: "none", borderTop: "none",
              borderBottom: "1px solid rgba(255,255,255,0.035)",
              cursor: "pointer", textAlign: "left",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{
                fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)",
                color: active ? "#b08ff5" : "#e8e8f5",
                letterSpacing: "-0.01em",
              }}>
                {m.base}
              </span>
              <motion.span
                key={`${m.symbol}-change-${m.up}`}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                style={{
                  fontSize: 9, fontFamily: "var(--mono)", fontWeight: 600,
                  color: up ? "#00d97e" : "#ff4560",
                  letterSpacing: "0.03em",
                }}
              >
                {up ? "+" : ""}{m.change24.toFixed(2)}%
              </motion.span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <motion.span
                key={`${m.symbol}-price-${m.price}`}
                initial={{ color: m.up ? "#00d97e" : "#ff4560" }}
                animate={{ color: "#e8e8f5" }}
                transition={{ duration: 0.6 }}
                style={{
                  fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                ${m.price.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}
              </motion.span>
              <span style={{
                fontSize: 8, fontFamily: "var(--mono)",
                color: m.funding >= 0 ? "rgba(0,217,126,0.55)" : "rgba(255,69,96,0.55)",
              }}>
                {m.funding >= 0 ? "+" : ""}{m.funding.toFixed(4)}%
              </span>
            </div>
          </motion.button>
        );
      })}

      {/* Coming soon placeholder */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "rgba(232,232,245,0.2)", letterSpacing: "0.12em" }}>
          MORE SOON
        </div>
      </div>
    </div>
  );
}
