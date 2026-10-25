import Link from "next/link";

import { TokenAvatar } from "@/components/discover/token-avatar";
import type { MarketToken } from "@/lib/market/types";
import {
  cn,
  formatAge,
  formatCompactUsd,
  formatPct,
  toneForPnl,
} from "@/lib/utils";

export type TokenRowVariant = "launch" | "graduating" | "trending";

export function TokenRow({
  token,
  variant,
  nowMs,
  isNew = false,
}: {
  token: MarketToken;
  variant: TokenRowVariant;
  nowMs: number;
  /** Appeared in the latest refresh — flashes once so the update is visible. */
  isNew?: boolean;
}) {
  const fdv = formatCompactUsd(token.fdvUsd);
  const volume1h = formatCompactUsd(token.volume1hUsd);
  const volume24h = formatCompactUsd(token.volume24hUsd);
  const change = formatPct(token.change1hPct);
  const changeTone = toneForPnl(token.change1hPct);
  const curve =
    token.curveProgressPct !== null
      ? `${Math.round(token.curveProgressPct)}% curve`
      : `on ${token.dex}`;

  const primary =
    variant === "trending"
      ? { value: change, tone: changeTone }
      : { value: fdv, tone: "text-ink" };

  // A minute-old launch always shows 0% for the hour, so show how far up the
  // curve it is instead; graduates care about flow over the full day.
  const secondary =
    variant === "trending"
      ? { value: `${volume1h} vol`, tone: "text-muted" }
      : variant === "graduating"
        ? { value: `${volume24h} 24h`, tone: "text-muted" }
        : { value: curve, tone: "text-muted" };

  const meta =
    variant === "trending" ? `${fdv} mcap` : `${token.buys1h}b / ${token.sells1h}s`;

  return (
    <Link
      href={`/coin/${token.mint}`}
      className={cn(
        "block rounded-[12px] px-2 py-2.5 transition-colors hover:bg-hover",
        isNew && "animate-[row-arrive_1.8s_ease-out]",
      )}
    >
      <div className="flex items-center gap-2.5">
        <TokenAvatar
          mint={token.mint}
          symbol={token.symbol}
          logoUrl={token.logoUrl}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-bold text-ink">
              {token.symbol}
            </span>
            {token.graduated ? (
              <span className="shrink-0 rounded-full border border-line-strong bg-hover px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted">
                grad
              </span>
            ) : null}
          </div>
          <p className="num mt-0.5 truncate text-[11px] text-muted">
            {formatAge(token.createdAt, nowMs)}
            <span aria-hidden className="px-1 text-line-strong">
              ·
            </span>
            {meta}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={cn("num text-[13px] font-bold", primary.tone)}>
            {primary.value}
          </p>
          <p className={cn("num mt-0.5 text-[11px]", secondary.tone)}>
            {secondary.value}
          </p>
        </div>
      </div>

      {variant === "graduating" && token.curveProgressPct !== null ? (
        <CurveBar pct={token.curveProgressPct} />
      ) : null}
    </Link>
  );
}

function CurveBar({ pct }: { pct: number }) {
  const rounded = Math.round(pct);
  const tone = pct >= 90 ? "bg-gold" : pct >= 70 ? "bg-up" : "bg-brand";

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${Math.max(3, rounded)}%` }}
        />
      </div>
      <span className="num w-8 shrink-0 text-right text-[10px] font-bold text-soft">
        {rounded}%
      </span>
    </div>
  );
}
