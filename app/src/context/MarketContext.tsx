import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";

export interface Market {
  symbol:   string;
  base:     string;
  price:    number;
  prev:     number;
  change24: number;
  high24:   number;
  low24:    number;
  volume24: string;
  oi:       string;
  funding:  number;
  up:       boolean;
}

const SEEDS: { symbol: string; base: string; price: number; volume24: string; oi: string; funding: number }[] = [
  { symbol: "BTC-PERP",  base: "BTC",  price: 67_420, volume24: "$2.14B", oi: "$847M",  funding:  0.0102 },
  { symbol: "ETH-PERP",  base: "ETH",  price:  3_540, volume24: "$981M",  oi: "$412M",  funding: -0.0031 },
  { symbol: "SOL-PERP",  base: "SOL",  price:    172, volume24: "$423M",  oi: "$191M",  funding:  0.0088 },
  { symbol: "AVAX-PERP", base: "AVAX", price:     38, volume24: "$89M",   oi: "$35M",   funding: -0.0014 },
];

interface Ctx {
  markets:     Market[];
  selected:    string;
  setSelected: (s: string) => void;
  current:     Market;
}

const MarketCtx = createContext<Ctx | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState("BTC-PERP");
  const [markets, setMarkets] = useState<Market[]>(() =>
    SEEDS.map((s) => ({
      ...s,
      prev:     s.price,
      change24: parseFloat(((Math.random() - 0.48) * 6).toFixed(2)),
      high24:   s.price * 1.019,
      low24:    s.price * 0.981,
      up:       true,
    }))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setMarkets((prev) =>
        prev.map((m) => {
          const delta = (Math.random() - 0.497) * m.price * 0.0016;
          const dp    = m.base === "SOL" || m.base === "AVAX" ? 3 : 2;
          const next  = parseFloat((m.price + delta).toFixed(dp));
          return { ...m, prev: m.price, price: next, up: next >= m.price };
        })
      );
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const current = markets.find((m) => m.symbol === selected) ?? markets[0];

  return (
    <MarketCtx.Provider value={{ markets, selected, setSelected, current }}>
      {children}
    </MarketCtx.Provider>
  );
}

export function useMarkets() {
  const ctx = useContext(MarketCtx);
  if (!ctx) throw new Error("useMarkets outside MarketProvider");
  return ctx;
}
