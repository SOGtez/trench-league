"use client";

import Link from "next/link";
import { useState } from "react";

import { TokenAvatar } from "@/components/discover/token-avatar";
import type { LivePriceTick } from "@/lib/market/live-prices";
import type { MarketToken } from "@/lib/market/types";
import {
  cn,
  formatAge,
  formatCompactUsd,
  formatPct,
  shortAddress,
} from "@/lib/utils";

export type TokenRowVariant = "launch" | "graduating" | "trending";

const COPY_RESET_MS = 1_200;

/** A coin minutes old often has no cap or volume reported yet — "—", not "$0". */
function compact(value: number | null): string {
  return value && value > 0 ? formatCompactUsd(value) : "—";
}

/**
 * One line of the board.
 *
 * Laid out like a trading terminal row rather than a card: art, ticker and
 * contract on the left, money on the right, and a strip of the numbers that
 * actually moved underneath. The whole row opens the coin — the link is an
 * overlay behind the content so the copy and buy controls can sit inside it
 * without nesting one interactive element in another.
 */
export function TokenRow({
  token,
  variant,
  nowMs,
  livePrice,
  isNew = false,
  enterDelayMs = 0,
}: {
  token: MarketToken;
  variant: TokenRowVariant;
  nowMs: number;
  /** Latest tick for this coin, when the board has one (it updates each 1s). */
  livePrice?: LivePriceTick;
  /** Appeared in the latest refresh — flashes once so the update is visible. */
  isNew?: boolean;
  /** Staggers the entrance so a column fills coin by coin. */
  enterDelayMs?: number;
}) {
  // The snapshot is the slow half (cap, curve, transactions); the price and its
  // 1h change come from the tick stream so the row breathes between rebuilds.
  const change1hPct = livePrice?.change1hPct ?? token.change1hPct;
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — no state to set.
    }
  };

  // A launch minute has no 24h history, so show the hour it does have.
  const volume =
    variant === "launch" ? token.volume1hUsd : token.volume24hUsd;
  const curve =
    token.curveProgressPct !== null
      ? Math.round(token.curveProgressPct)
      : null;

  return (
    <div
      className="animate-[row-enter_320ms_ease-out_both]"
      style={{ animationDelay: `${enterDelayMs}ms` }}
    >
      <div
        className={cn(
          "group relative rounded-[8px] border border-line/70 transition-colors hover:border-line-strong hover:bg-hover",
          isNew && "animate-[row-arrive_1.8s_ease-out]",
        )}
      >
        <Link
          href={`/coin/${token.mint}`}
          aria-label={`Open ${token.symbol}`}
          className="absolute inset-0 z-0 rounded-[8px]"
        />

        {/* Content sits above the link but ignores pointer events, so the row
            stays clickable everywhere except its own controls. */}
        <div className="pointer-events-none relative z-10 flex gap-2.5 px-2 py-2">
          <div className="relative shrink-0">
            <TokenAvatar
              mint={token.mint}
              symbol={token.symbol}
              logoUrl={token.logoUrl}
              square
              className="size-9"
            />
            {token.graduated ? (
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 grid size-3 place-items-center rounded-full bg-up text-[7px] font-black text-bg ring-2 ring-card"
              >
                ✓
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-[13px] font-bold leading-tight text-ink">
                {token.symbol}
              </span>
              <button
                type="button"
                onClick={copyAddress}
                title={copied ? "Copied" : `Copy ${token.mint}`}
                aria-label={`Copy ${token.symbol} contract address`}
                className="pointer-events-auto shrink-0 rounded-[4px] p-0.5 text-muted transition-colors hover:bg-active hover:text-ink"
              >
                {copied ? (
                  <svg
                    className="size-3 text-up"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m20 6-11 11-5-5" />
                  </svg>
                ) : (
                  <svg
                    className="size-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
                  </svg>
                )}
              </button>
            </div>

            <div className="num mt-1 flex items-center gap-1.5 truncate text-[10px] text-muted">
              <span className="shrink-0 text-soft">
                {formatAge(token.createdAt, nowMs)}
              </span>
              <span aria-hidden className="text-line-strong">
                |
              </span>
              <span className="truncate">{shortAddress(token.mint, 4)}</span>
              <span aria-hidden className="text-line-strong">
                ·
              </span>
              <span className="shrink-0">{compact(token.liquidityUsd)} liq</span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <MoveBadge label="5m" value={token.change5mPct} />
              <MoveBadge label="1h" value={change1hPct} />
              {curve !== null ? (
                <span className="num inline-flex items-center rounded-[4px] border border-gold/30 bg-gold/10 px-1 py-px text-[9px] font-bold text-gold">
                  {curve}% curve
                </span>
              ) : (
                <span className="num inline-flex items-center rounded-[4px] border border-line bg-active/60 px-1 py-px text-[9px] font-bold uppercase text-muted">
                  {token.dex}
                </span>
              )}
              <span className="num inline-flex items-center gap-1 text-[9.5px] font-bold">
                <span className="text-up">↑{token.buys1h}</span>
                <span className="text-down">↓{token.sells1h}</span>
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <div className="num text-right text-[10px] leading-tight text-muted">
              <span className="mr-1 text-[8.5px] font-bold uppercase tracking-wide text-muted/70">
                MC
              </span>
              <span className="font-bold text-ink">
                {compact(token.fdvUsd)}
              </span>
            </div>
            <div className="num mt-0.5 text-right text-[10px] leading-tight text-muted">
              <span className="mr-1 text-[8.5px] font-bold uppercase tracking-wide text-muted/70">
                V
              </span>
              <span className="font-semibold text-soft">{compact(volume)}</span>
            </div>

            <Link
              href={`/coin/${token.mint}`}
              tabIndex={-1}
              aria-hidden
              className="pointer-events-auto mt-2 inline-flex h-[22px] items-center gap-1 rounded-full border border-brand/40 bg-brand/15 px-2 text-[10px] font-bold text-link transition-colors hover:bg-brand/25"
            >
              <svg
                className="size-2.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
              </svg>
              Buy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A tiny coloured move, e.g. `+4.2% 5m`. */
function MoveBadge({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const n = Number(value ?? 0);
  const known = value !== null && Number.isFinite(n);
  const tone = !known
    ? "border-line bg-active/50 text-muted"
    : n > 0
      ? "border-up/30 bg-up/10 text-up"
      : n < 0
        ? "border-down/30 bg-down/10 text-down"
        : "border-line bg-active/50 text-muted";

  return (
    <span
      className={cn(
        "num inline-flex items-baseline gap-1 rounded-[4px] border px-1 py-px text-[9px] font-bold",
        tone,
      )}
    >
      {known ? formatPct(n, 1) : "—"}
      <span className="text-[8px] font-semibold opacity-60">{label}</span>
    </span>
  );
}
