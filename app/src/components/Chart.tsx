import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type CandlestickData,
  type Time,
  ColorType,
} from "lightweight-charts";

interface Props {
  basePrice: number;
  marketSymbol: string;
}

function generateCandles(basePrice: number, count = 200): CandlestickData<Time>[] {
  const candles: CandlestickData<Time>[] = [];
  let price = basePrice * (1 - 0.04 + Math.random() * 0.01);
  const interval = 5 * 60; // 5-min candles
  // Snap to the current 5-min slot — must match the live tick formula exactly
  // so update() always targets the last candle, never goes backward.
  const now = Math.floor(Math.floor(Date.now() / 1000) / interval) * interval;

  for (let i = count - 1; i >= 0; i--) {
    const time = (now - i * interval) as Time;
    const open = price;
    const move = (Math.random() - 0.492) * price * 0.006;
    const close = open + move;
    const high = Math.max(open, close) + Math.random() * Math.abs(move) * 1.4;
    const low  = Math.min(open, close) - Math.random() * Math.abs(move) * 1.4;
    candles.push({ time, open, high, low, close });
    price = close;
  }
  return candles;
}

export function Chart({ basePrice, marketSymbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<SeriesType> | null>(null);
  const lastPriceRef  = useRef(basePrice);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: "#0a0a12" },
        textColor:   "rgba(238,238,245,0.4)",
        fontFamily:  "'Space Mono', monospace",
        fontSize:    10,
      },
      grid: {
        vertLines:   { color: "rgba(255,255,255,0.03)" },
        horzLines:   { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        vertLine:    { color: "rgba(124,58,237,0.4)", width: 1, style: 1 },
        horzLine:    { color: "rgba(124,58,237,0.4)", width: 1, style: 1 },
      },
      rightPriceScale: {
        borderColor:   "rgba(255,255,255,0.05)",
        textColor:     "rgba(238,238,245,0.4)",
        scaleMargins:  { top: 0.1, bottom: 0.12 },
      },
      timeScale: {
        borderColor:        "rgba(255,255,255,0.05)",
        timeVisible:        true,
        secondsVisible:     false,
        tickMarkFormatter: (t: number) => {
          const d = new Date(t * 1000);
          return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
        },
      },
      handleScroll:  { mouseWheel: true, pressedMouseMove: true },
      handleScale:   { mouseWheel: true, pinch: true },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:          "#10b981",
      downColor:        "#f43f5e",
      borderUpColor:    "#10b981",
      borderDownColor:  "#f43f5e",
      wickUpColor:      "rgba(16,185,129,0.6)",
      wickDownColor:    "rgba(244,63,94,0.6)",
    });

    const candles = generateCandles(basePrice);
    series.setData(candles);
    chart.timeScale().fitContent();
    lastPriceRef.current = candles[candles.length - 1].close;

    chartRef.current  = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => { seriesRef.current = null; chart.remove(); ro.disconnect(); };
  }, [marketSymbol]); // rebuild chart when market changes

  // tick live candle
  useEffect(() => {
    const id = setInterval(() => {
      if (!seriesRef.current) return;
      const now  = Math.floor(Date.now() / 1000);
      const slot = Math.floor(now / 300) * 300 as Time;
      const prev = lastPriceRef.current;
      const next = prev + (Math.random() - 0.498) * prev * 0.002;
      lastPriceRef.current = next;
      seriesRef.current.update({
        time:  slot,
        open:  prev,
        high:  Math.max(prev, next) + Math.random() * 10,
        low:   Math.min(prev, next) - Math.random() * 10,
        close: next,
      });
    }, 1800);
    return () => clearInterval(id);
  }, [marketSymbol]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
