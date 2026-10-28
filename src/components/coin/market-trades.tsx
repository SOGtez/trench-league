"use client";

import { useEffect, useState } from "react";

import { cn, formatUsdPrice, shortAddress } from "@/lib/utils";

type TapeTrade = {
  ts: number;
  side: "buy" | "sell";
  priceUsd: number | null;
  volumeUsd: number | null;
  tokenAmount: number | null;
  wallet: string | null;
  txHash: string;
};

type Status = "loading" | "live" | "stale" | "offline";

/** Dollars on a tape: cents for real money, significant digits for dust. */
function tapeUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000) {
    return `$${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)}`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(2)}`;
}

function clock(ts: number): string {
  return new Date(ts * 1_000).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * The right-hand tape: every print on this pool, newest at the top.
 *
 * A market with no order book has fills instead, so this is the terminal's
 * equivalent of a trade blotter — real pool trades, one row each, repainted on
 * a 4s poll. The polling loop skips hidden tabs: GeckoTerminal's 30 req/min
 * budget is shared with the candles and the snapshot, and a backgrounded tab
 * has no reason to spend it.
 */
export function MarketTrades({
  mint,
  className,
}: {
  mint: string;
  className?: string;
}) {
  const [trades, setTrades] = useState<TapeTrade[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  // Prints that land while the panel is open glow once. Everything already on
  // the tape at mount is history and stays quiet.
  const [openedAt] = useState(() => Math.floor(Date.now() / 1_000));

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let retryMs = 4_000;

    const load = async (): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/market/trades?mint=${encodeURIComponent(mint)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const body = (await response.json()) as {
          trades?: TapeTrade[];
          stale?: boolean;
        };
        if (cancelled) return true;

        if (Array.isArray(body.trades)) setTrades(body.trades);
        setStatus(body.stale ? "stale" : "live");
        return true;
      } catch {
        if (!cancelled) {
          // Keep the rows that are already on screen; the tape is ordered by
          // time, so an older print is still a true print.
          setStatus((current) => (current === "loading" ? "offline" : "stale"));
        }
        return false;
      }
    };

    const schedule = async () => {
      if (!document.hidden) {
        const ok = await load();
        if (cancelled) return;
        if (ok) retryMs = 4_000;
        else retryMs = Math.min(retryMs * 2, 20_000);
      }
      timer = window.setTimeout(schedule, retryMs);
    };

    void schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [mint]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-ink">Trades</span>
          <span className="num text-[10px] font-semibold text-muted">
            {trades.length > 0 ? `${trades.length}` : ""}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider",
            status === "live"
              ? "text-muted"
              : status === "stale"
                ? "text-gold"
                : "text-muted/70",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              status === "live"
                ? "animate-pulse bg-up"
                : status === "stale"
                  ? "bg-gold"
                  : status === "offline"
                    ? "bg-down"
                    : "bg-line-strong",
            )}
          />
          {status === "live"
            ? "live"
            : status === "stale"
              ? "reconnecting"
              : status === "offline"
                ? "offline"
                : "loading"}
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-[1fr_auto_auto] gap-3 border-b border-line/60 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-muted/70">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="w-[52px] text-right">Time</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted">
            {status === "offline" ? "Tape unavailable — retrying" : "Waiting for prints…"}
          </p>
        ) : (
          <ul>
            {trades.map((trade) => {
              const fresh = trade.ts > openedAt;
              const price = trade.priceUsd;

              return (
                <li
                  key={trade.txHash}
                  title={`${trade.side} ${tapeUsd(trade.volumeUsd)}${trade.wallet ? ` · ${shortAddress(trade.wallet, 6)}` : ""}`}
                  className={cn(
                    "grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-[3px] text-[11px] hover:bg-hover",
                    fresh && "animate-[row-arrive_1.8s_ease-out]",
                  )}
                >
                  <span
                    className={cn(
                      "num truncate font-semibold",
                      trade.side === "buy" ? "text-up" : "text-down",
                    )}
                  >
                    {formatUsdPrice(price)}
                  </span>
                  <span className="num text-right text-soft">
                    {tapeUsd(trade.volumeUsd)}
                  </span>
                  <span className="num w-[52px] text-right text-muted/70">
                    {clock(trade.ts)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
