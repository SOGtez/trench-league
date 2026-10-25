"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const TIMEFRAMES = ["1m", "5m", "15m", "1h"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const UP = "#3ddc97";
const DOWN = "#ff8a4c";

function priceFormatFor(candles: Candle[]) {
  const max = candles.reduce((best, candle) => Math.max(best, candle.high), 0);
  const precision = max > 0 ? Math.min(12, Math.max(2, Math.ceil(-Math.log10(max)) + 2)) : 8;
  return {
    type: "price" as const,
    precision,
    minMove: Number((10 ** -precision).toFixed(precision)),
  };
}

export function PriceChart({ mint }: { mint: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fittedRef = useRef<string | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7d8694",
        fontSize: 10,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(35, 39, 46, 0.55)" },
        horzLines: { color: "rgba(35, 39, 46, 0.55)" },
      },
      rightPriceScale: { borderColor: "#23272e" },
      timeScale: {
        borderColor: "#23272e",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
      },
      crosshair: {
        vertLine: { color: "#3a4048", labelBackgroundColor: "#2a2f37" },
        horzLine: { color: "#3a4048", labelBackgroundColor: "#2a2f37" },
      },
      localization: { priceFormatter: (price: number) => price.toPrecision(4) },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: priceFormatFor([]),
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/market/candles?mint=${encodeURIComponent(mint)}&tf=${timeframe}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const body = (await response.json()) as { candles: Candle[] };
        if (cancelled || !seriesRef.current || !chartRef.current) return;

        if (!body.candles?.length) {
          setStatus("empty");
          return;
        }

        seriesRef.current.applyOptions({
          priceFormat: priceFormatFor(body.candles),
        });
        seriesRef.current.setData(
          body.candles.map((candle) => ({
            time: candle.time as UTCTimestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );

        const fitKey = `${mint}:${timeframe}`;
        if (fittedRef.current !== fitKey) {
          chartRef.current.timeScale().fitContent();
          fittedRef.current = fitKey;
        }

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus((current) => (current === "ready" ? "ready" : "error"));
      }
    };

    void load();
    const timer = window.setInterval(load, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mint, timeframe]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setTimeframe(option);
                setStatus("loading");
              }}
              aria-pressed={option === timeframe}
              className={cn(
                "h-7 rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                option === timeframe
                  ? "bg-active text-ink"
                  : "text-muted hover:bg-hover hover:text-soft",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {status === "ready" ? "Live candles" : status === "empty" ? "No candles" : status === "error" ? "Feed offline" : "Loading"}
        </span>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="h-[320px] w-full sm:h-[380px]" />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="rounded-full border border-line bg-card/90 px-3 py-1.5 text-[12px] font-semibold text-muted">
              {status === "loading"
                ? "Loading candles…"
                : status === "empty"
                  ? "No trades yet on this pool"
                  : "Candle feed is offline — retrying"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
