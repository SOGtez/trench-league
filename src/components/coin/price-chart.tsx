"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLivePrices } from "@/lib/market/live-prices";
import { useTradeSettings } from "@/lib/trade/settings";
import { cn, formatPct } from "@/lib/utils";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** One of the signed-in account's own fills on this coin. */
export type ChartFill = {
  time: number;
  side: "buy" | "sell";
  /** SOL in (buy) or SOL out (sell), labelled on the marker. */
  solAmount: number;
};

const TIMEFRAMES = ["1m", "5m", "15m", "1h"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

/** Width of one bar, so a live price can be slotted into the right bucket. */
const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
};

const UP = "#3ddc97";
const DOWN = "#ff8a4c";

/**
 * Roughly the width of a marker caption. Two fills closer together than this
 * would print their sizes on top of each other, so only the newer one keeps its
 * label — zooming in spreads the bars out and the labels come back.
 */
const LABEL_MIN_GAP_PX = 52;

function priceFormatFor(candles: Candle[]) {
  const max = candles.reduce((best, candle) => Math.max(best, candle.high), 0);
  const precision = max > 0 ? Math.min(12, Math.max(2, Math.ceil(-Math.log10(max)) + 2)) : 8;
  return {
    type: "price" as const,
    precision,
    minMove: Number((10 ** -precision).toFixed(precision)),
  };
}

/**
 * The bar a fill belongs on.
 *
 * The OHLCV feed only publishes a bucket once it has trades in it, so the last
 * bar is regularly a minute behind the clock. A fill that just executed is
 * therefore *newer* than every loaded bar — clamping it onto the newest bar is
 * what keeps a fresh fill visible; it slides to its real bucket as the feed and
 * the live ticker extend the series. Fills older than the loaded window are the
 * only ones dropped.
 */
function snapToCandle(candles: Candle[], time: number): number | null {
  if (!candles.length) return null;

  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  if (time < first) return null;

  const target = Math.min(time, last);
  let best = last;
  let bestGap = Math.abs(best - target);
  for (const candle of candles) {
    const gap = Math.abs(candle.time - target);
    if (gap < bestGap) {
      best = candle.time;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * The chart paints on a canvas, so it needs a real font family string rather
 * than a CSS variable. Reading the computed family off a throwaway `.num`
 * element picks up the app's own webfont — the axis labels and marker labels
 * then match the rest of the terminal instead of whatever system monospace the
 * browser happens to resolve, which on some machines is nothing at all.
 */
function chartFontFamily(container: HTMLElement) {
  const probe = document.createElement("span");
  probe.className = "num";
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap";
  container.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();

  return family && family !== ""
    ? family
    : "ui-monospace, SFMono-Regular, monospace";
}

/** Header readout: memecoins need significant digits, not fixed decimals. */
function ohlcPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value >= 1 ? value.toFixed(2) : value.toPrecision(4);
}

/** Short SOL figure for a marker label: 0.2, 1.5, 24. */
function solLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 100) return String(Math.round(value));
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0$/, "");
}

export function PriceChart({
  mint,
  symbol,
  dex,
  avgEntryPriceUsd = null,
  fills = [],
}: {
  mint: string;
  /** Shown in the chart's title row, like a terminal's instrument label. */
  symbol?: string;
  dex?: string;
  /** Dashed line showing where this account got in. */
  avgEntryPriceUsd?: number | null;
  /** Own fills, drawn as arrows on their candle. */
  fills?: ChartFill[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fittedRef = useRef<string | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const { settings } = useTradeSettings();

  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  // Mirrors the newest bar for the header readout; the canvas paint is the
  // series' own job, this is only the numbers beside the instrument name.
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const livePrice = useLivePrices([mint])[mint]?.priceUsd ?? null;
  // Bumped on every candle load so marker placement can re-run against fresh
  // bar times without refetching anything.
  const [dataVersion, setDataVersion] = useState(0);

  const fillsRef = useRef<ChartFill[]>(fills);
  const markersOnRef = useRef(settings.chartMarkers);

  /**
   * Own fills, drawn on the bars they happened in. Runs on every candle load, a
   * new bar, a zoom, and a new fill, so an arrow never points at a bar that has
   * scrolled out of the series.
   */
  const placeMarkers = useCallback(() => {
    const markers = markersRef.current;
    if (!markers) return;

    const candles = candlesRef.current;
    if (!markersOnRef.current || !candles.length || !fillsRef.current.length) {
      markers.setMarkers([]);
      return;
    }

    const indexOfBar = new Map<number, number>();
    candles.forEach((candle, index) => indexOfBar.set(candle.time, index));
    const barSpacing = chartRef.current?.timeScale().options().barSpacing ?? 6;

    // Several fills can land in one bar (a scale-in, or a buy and a sell in the
    // same minute). One marker per bar per side, carrying the total size, keeps
    // a busy minute readable instead of stacking arrows — buys sit under the
    // bar and sells above it, so the two never collide.
    const byBar = new Map<
      string,
      { time: number; side: "buy" | "sell"; count: number; sol: number }
    >();

    for (const fill of fillsRef.current) {
      const time = snapToCandle(candles, fill.time);
      if (time === null) continue;

      const sol = Number.isFinite(fill.solAmount) ? Math.abs(fill.solAmount) : 0;
      const key = `${time}:${fill.side}`;
      const bucket = byBar.get(key) ?? { time, side: fill.side, count: 0, sol: 0 };
      bucket.count += 1;
      bucket.sol += sol;
      byBar.set(key, bucket);
    }

    const buckets = [...byBar.values()].sort((a, b) => a.time - b.time);

    // Walk newest first, so the freshest fill is the one that keeps its caption
    // when two of them are packed too tightly to label both.
    const labelledAt: Record<"buy" | "sell", number | null> = {
      buy: null,
      sell: null,
    };
    const next: SeriesMarker<Time>[] = [];

    for (let index = buckets.length - 1; index >= 0; index -= 1) {
      const bucket = buckets[index];
      const bar = indexOfBar.get(bucket.time) ?? 0;
      const previous = labelledAt[bucket.side];
      const roomForLabel =
        previous === null ||
        Math.abs(bar - previous) * barSpacing >= LABEL_MIN_GAP_PX;
      if (roomForLabel) labelledAt[bucket.side] = bar;

      const size = solLabel(bucket.sol);
      const order = bucket.count > 1 ? `×${bucket.count} ` : "";

      next.push({
        time: bucket.time as UTCTimestamp,
        position: bucket.side === "buy" ? "belowBar" : "aboveBar",
        color: bucket.side === "buy" ? UP : DOWN,
        shape: bucket.side === "buy" ? "arrowUp" : "arrowDown",
        text: roomForLabel
          ? `${order}${bucket.side === "buy" ? "B" : "S"}${size ? ` ${size}` : ""}`
          : undefined,
      } satisfies SeriesMarker<Time>);
    }

    // The plugin wants markers in ascending time order.
    markers.setMarkers(next.reverse());
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7d8694",
        fontSize: 10,
        fontFamily: chartFontFamily(container),
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

    // Volume sits in the bottom fifth of the plot, on its own invisible scale,
    // so price keeps the full height it would have had without it.
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    markersRef.current = createSeriesMarkers(series, []);

    // Zooming changes how much room a caption has, so labels are re-decided
    // whenever the visible range moves.
    const onRangeChange = () => placeMarkers();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
      priceLineRef.current = null;
      candlesRef.current = [];
    };
  }, [placeMarkers]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let retryMs = 5_000;

    const load = async (): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/market/candles?mint=${encodeURIComponent(mint)}&tf=${timeframe}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const body = (await response.json()) as { candles: Candle[] };
        if (cancelled || !seriesRef.current || !chartRef.current) return true;

        if (!body.candles?.length) {
          setStatus("empty");
          return true;
        }

        // Skip the redraw when the feed has nothing new. Beyond saving a
        // full-series redraw every few seconds, this is what stops the chart
        // from snapping backwards over the bar the live ticker is shaping.
        const previous = candlesRef.current;
        const previousLast = previous[previous.length - 1];
        const incomingLast = body.candles[body.candles.length - 1];

        if (previousLast) {
          const unchanged =
            previous.length === body.candles.length &&
            previousLast.time === incomingLast.time &&
            previousLast.close === incomingLast.close &&
            previousLast.high === incomingLast.high &&
            previousLast.low === incomingLast.low;

          if (unchanged || previousLast.time > incomingLast.time) return true;
        }

        candlesRef.current = body.candles;
        setDataVersion((current) => current + 1);
        setLastCandle(incomingLast);

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

        volumeRef.current?.setData(
          body.candles.map((candle) => ({
            time: candle.time as UTCTimestamp,
            value: candle.volume,
            color:
              candle.close >= candle.open
                ? "rgba(61, 220, 151, 0.28)"
                : "rgba(255, 138, 76, 0.28)",
          })),
        );

        const fitKey = `${mint}:${timeframe}`;
        if (fittedRef.current !== fitKey) {
          chartRef.current.timeScale().fitContent();
          fittedRef.current = fitKey;
        }

        setStatus("ready");
        return true;
      } catch {
        if (!cancelled) setStatus((current) => (current === "ready" ? "ready" : "error"));
        return false;
      }
    };

    // The candle feed rate limits, and those responses clear within seconds.
    // Retrying quickly (with a short backoff) fills the chart instead of
    // leaving it blank until the next full poll.
    const schedule = async () => {
      const ok = await load();
      if (cancelled) return;
      if (ok) retryMs = 5_000;
      timer = window.setTimeout(schedule, ok ? 5_000 : retryMs);
      if (!ok) retryMs = Math.min(retryMs * 2, 30_000);
    };

    void schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [mint, timeframe]);

  // Live tick. The newest bar is rebuilt from the streaming price once a second
  // and written with `update`, which touches one bar instead of replacing the
  // series — the viewport, scroll position and crosshair all survive it.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !livePrice || livePrice <= 0) return;

    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    if (!last) return;

    const span = TIMEFRAME_SECONDS[timeframe];
    const bucket = Math.floor(Date.now() / 1_000 / span) * span;
    if (bucket < last.time) return;

    const appended = bucket !== last.time;
    const next: Candle = appended
      ? {
          time: bucket,
          open: last.close,
          high: Math.max(last.close, livePrice),
          low: Math.min(last.close, livePrice),
          close: livePrice,
          volume: 0,
        }
      : {
          ...last,
          close: livePrice,
          high: Math.max(last.high, livePrice),
          low: Math.min(last.low, livePrice),
        };

    candlesRef.current = appended
      ? [...candles, next]
      : [...candles.slice(0, -1), next];

    setLastCandle(next);

    try {
      series.update({ ...next, time: next.time as UTCTimestamp });
      if (appended) {
        volumeRef.current?.update({
          time: next.time as UTCTimestamp,
          value: 0,
          color: "rgba(61, 220, 151, 0.28)",
        });
      }
    } catch {
      // A rejected timestamp (clock skew) is not worth breaking the chart over;
      // the next poll restores real data.
      return;
    }

    // Markers snap to bar times, so they only need re-placing when a bar is
    // actually added — not on every tick inside one.
    if (appended) setDataVersion((current) => current + 1);
  }, [livePrice, timeframe]);

  // Avg-entry line. Recreated whenever the entry or the toggle changes; a price
  // line is cheap, so there is no reason to mutate it in place.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }

    if (!settings.chartMarkers || !avgEntryPriceUsd || avgEntryPriceUsd <= 0) {
      return;
    }

    priceLineRef.current = series.createPriceLine({
      price: avgEntryPriceUsd,
      color: "rgba(61, 220, 151, 0.75)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      title: "Avg entry",
    });
  }, [avgEntryPriceUsd, settings.chartMarkers]);

  // A new fill, the toggle, or a fresh bar all change what belongs on the
  // chart. Fills older than the loaded window are simply not drawn: a 1m chart
  // only holds a couple of hours, and inventing a bar for them would lie.
  useEffect(() => {
    fillsRef.current = fills;
    markersOnRef.current = settings.chartMarkers;
    placeMarkers();
  }, [fills, settings.chartMarkers, placeMarkers]);

  useEffect(() => {
    placeMarkers();
  }, [dataVersion, placeMarkers]);

  const barChange =
    lastCandle && lastCandle.open > 0
      ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Instrument row: name, the newest bar's OHLC, and how fresh the feed
          is. The numbers come from the same candle the canvas is drawing. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
        <span className="text-[11px] font-bold text-ink">
          {symbol ?? mint.slice(0, 6)}
          {dex ? <span className="font-medium text-muted"> · {dex}</span> : null}
        </span>

        <div className="num flex items-center gap-x-2.5 text-[10px] text-muted">
          <span>
            O <span className="text-soft">{ohlcPrice(lastCandle?.open ?? 0)}</span>
          </span>
          <span>
            H <span className="text-soft">{ohlcPrice(lastCandle?.high ?? 0)}</span>
          </span>
          <span>
            L <span className="text-soft">{ohlcPrice(lastCandle?.low ?? 0)}</span>
          </span>
          <span>
            C <span className="text-ink">{ohlcPrice(lastCandle?.close ?? 0)}</span>
          </span>
          {barChange !== null ? (
            <span
              className={cn(
                "font-semibold",
                barChange >= 0 ? "text-up" : "text-down",
              )}
            >
              {formatPct(barChange, 2)}
            </span>
          ) : null}
        </div>

        <span className="ml-auto inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted">
          {status === "ready" ? (
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-up" />
          ) : null}
          {status === "ready" ? "1s ticks" : status === "empty" ? "no candles" : status === "error" ? "offline" : "loading"}
        </span>
      </div>

      {/* Grows to fill its pane so the chart keeps the height the layout gives
          it; autoSize redraws on every resize. */}
      <div className="relative min-h-[320px] flex-1 sm:min-h-[380px]">
        <div ref={containerRef} className="absolute inset-0" />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="max-w-[92%] rounded-[14px] border border-line bg-card/90 px-3 py-1.5 text-center text-[12px] font-semibold text-muted">
              {status === "loading"
                ? "Loading candles…"
                : status === "empty"
                  ? "No trades yet on this pool"
                  : "Candle feed is offline — retrying"}
            </p>
          </div>
        ) : null}
      </div>

      {/* Bottom rail, terminal-style: resolution on the left, viewport
          controls on the right. */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-line px-2">
        <div className="flex items-center gap-0.5">
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
                "h-6 rounded-[6px] px-2 text-[10px] font-bold uppercase tracking-wide transition-colors",
                option === timeframe
                  ? "bg-active text-ink"
                  : "text-muted hover:bg-hover hover:text-soft",
              )}
            >
              {option}
            </button>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            title="Fit all loaded candles in view"
            className="h-6 rounded-[6px] px-2 text-[10px] font-bold uppercase tracking-wide text-muted transition-colors hover:bg-hover hover:text-soft"
          >
            Fit
          </button>
        </div>
        <span className="num pr-1 text-[9px] font-semibold uppercase tracking-wider text-muted/70">
          {TIMEFRAMES.includes(timeframe) ? `${timeframe} candles` : timeframe}
        </span>
      </div>
    </div>
  );
}
