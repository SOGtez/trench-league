"use client";

import Link from "next/link";
import { useState } from "react";

import { LivePrice } from "@/components/coin/live-price";
import { MarketTrades } from "@/components/coin/market-trades";
import { PriceChart, type ChartFill } from "@/components/coin/price-chart";
import {
  TradePanel,
  type PositionStats,
} from "@/components/coin/trade-panel";
import { TokenAvatar } from "@/components/discover/token-avatar";
import { Pill } from "@/components/ui/pill";
import type { AccountSummary } from "@/lib/leagues/active-account";
import { useLivePrices } from "@/lib/market/live-prices";
import type { MarketToken } from "@/lib/market/types";
import { useTradeSettings } from "@/lib/trade/settings";
import {
  cn,
  formatAge,
  formatCompactUsd,
  formatPct,
  formatSolAmount,
  formatTokenAmount,
  formatUsdPrice,
  shortAddress,
  toneForPnl,
} from "@/lib/utils";

/** One of this account's fills on this coin, for the blotter table. */
export type LedgerRow = {
  time: number;
  side: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
};

type Tab = "position" | "fills" | "market";

const TABS: { id: Tab; label: string }[] = [
  { id: "position", label: "Position" },
  { id: "fills", label: "My trades" },
  { id: "market", label: "Market" },
];

function clock(ts: number) {
  return new Date(ts * 1_000).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * The coin page as a trading terminal: instrument strip, chart, tape, ticket,
 * and a tabbed blotter underneath.
 *
 * One client tree because the pieces share live state — the strip, the ticket
 * and the blotter all read the same 1s price stream, so a mark on the position
 * table and the quote in the ticket can never disagree by a tick.
 */
export function CoinTerminal({
  token,
  solPriceUsd,
  avgEntryPriceUsd,
  chartFills,
  ledger,
  position,
  positionStats,
  solBalance,
  accounts,
  activeAccountId,
  feeBps,
  priorityFeeSol,
}: {
  token: MarketToken;
  solPriceUsd: number | null;
  avgEntryPriceUsd: number | null;
  chartFills: ChartFill[];
  ledger: LedgerRow[];
  position: { tokens: number; costSol: number };
  positionStats: PositionStats;
  solBalance: number;
  accounts: AccountSummary[];
  activeAccountId: string | null;
  feeBps: number;
  priorityFeeSol: number;
}) {
  const [tab, setTab] = useState<Tab>("position");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { settings, update } = useTradeSettings();

  const tick = useLivePrices([token.mint])[token.mint];
  const markPriceUsd = tick?.priceUsd ?? token.priceUsd;
  const change1hPct = tick?.change1hPct ?? token.change1hPct;

  const priceSol =
    markPriceUsd && solPriceUsd ? markPriceUsd / solPriceUsd : null;
  const positionValueSol =
    position.tokens > 0 && priceSol ? position.tokens * priceSol : 0;
  const positionPnl = positionValueSol - position.costSol;
  const positionPnlPct =
    position.costSol > 0 ? (positionPnl / position.costSol) * 100 : 0;

  async function copyMint() {
    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_200);
    } catch {
      // Clipboard is blocked on plain http; the address is in the Market tab.
    }
  }

  return (
    <div
      className={cn(
        "coin-terminal flex flex-col overflow-hidden border-line bg-bg lg:border-x",
        expanded && "coin-terminal-full",
      )}
    >
      {/* Instrument strip */}
      <div className="no-scrollbar flex h-11 shrink-0 items-stretch overflow-x-auto border-b border-line bg-header/40">
        <div className="flex shrink-0 items-center gap-2 pl-3 pr-3">
          <TokenAvatar
            mint={token.mint}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            className="size-6 rounded-[5px] text-[9px]"
          />
          <span className="text-[13px] font-bold tracking-tight">
            {token.symbol}
          </span>
          <Pill tone={token.graduated ? "brand" : "gold"}>
            {token.graduated ? "graduated" : "curve"}
          </Pill>
        </div>

        <div className="flex shrink-0 flex-col justify-center border-l border-line/70 px-3">
          <LivePrice
            mint={token.mint}
            initialPriceUsd={token.priceUsd}
            initialChange1hPct={token.change1hPct}
            variant="inline"
          />
        </div>

        <Stat label="FDV" value={formatCompactUsd(token.fdvUsd)} />
        <Stat label="Liquidity" value={formatCompactUsd(token.liquidityUsd)} />
        <Stat label="24h vol" value={formatCompactUsd(token.volume24hUsd)} />
        <Stat
          label="1h b/s"
          value={`${token.buys1h}/${token.sells1h}`}
          tone="text-soft"
        />
        <Stat
          label={token.graduated ? "Status" : "Curve"}
          value={
            token.graduated
              ? "graduated"
              : token.curveProgressPct !== null
                ? `${Math.round(token.curveProgressPct)}%`
                : "—"
          }
          tone={token.graduated ? "text-brand" : "text-gold"}
        />
        <Stat label="Age" value={formatAge(token.createdAt)} />
        <Stat
          label="SOL"
          value={solPriceUsd ? formatUsdPrice(solPriceUsd) : "—"}
        />
        <Stat
          label="Change 1h"
          value={formatPct(change1hPct)}
          tone={toneForPnl(change1hPct)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tool rail */}
        <aside className="flex w-9 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-header/25 py-1.5 lg:w-10">
          <Link
            href="/discover"
            title="Back to Discover"
            aria-label="Back to Discover"
            className="rail-button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </Link>

          <button
            type="button"
            onClick={() => update({ chartMarkers: !settings.chartMarkers })}
            aria-pressed={settings.chartMarkers}
            title={
              settings.chartMarkers
                ? "Hide your fills and avg entry"
                : "Show your fills and avg entry"
            }
            className={cn("rail-button", settings.chartMarkers && "text-up")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 17l5-6 4 3 4-7 5 4" />
              <circle cx="8" cy="11" r="1.4" />
              <circle cx="16" cy="7" r="1.4" />
            </svg>
          </button>

          <button
            type="button"
            onClick={copyMint}
            title={copied ? "Copied" : "Copy contract address"}
            aria-label="Copy contract address"
            className={cn("rail-button", copied && "text-up")}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h8" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-pressed={expanded}
            title={expanded ? "Exit full screen" : "Full screen"}
            aria-label="Toggle full screen"
            className={cn("rail-button", expanded && "text-brand")}
          >
            {expanded ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 9V3h6M21 15v6h-6M15 3h6v6M9 21H3v-6" />
              </svg>
            )}
          </button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-line lg:border-b-0 lg:border-r">
              <PriceChart
                mint={token.mint}
                symbol={token.symbol}
                dex={token.dex}
                avgEntryPriceUsd={avgEntryPriceUsd}
                fills={chartFills}
              />
            </div>

            <div className="flex shrink-0 flex-col lg:w-[340px]">
              <MarketTrades
                mint={token.mint}
                className="h-[240px] lg:h-auto lg:max-h-[40%] lg:min-h-[168px] lg:flex-1"
              />
              <div className="min-h-0 overflow-y-auto border-t border-line lg:max-h-[68%] lg:shrink-0">
                <TradePanel
                  token={token}
                  solBalance={solBalance}
                  positionTokens={position.tokens}
                  positionCostSol={position.costSol}
                  positionStats={positionStats}
                  solPriceUsd={solPriceUsd}
                  accounts={accounts}
                  activeAccountId={activeAccountId}
                  feeBps={feeBps}
                  priorityFeeSol={priorityFeeSol}
                />
              </div>
            </div>
          </div>

          {/* Blotter */}
          <div className="flex h-[136px] shrink-0 flex-col border-t border-line">
            <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-2">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={tab === entry.id}
                  className={cn(
                    "h-7 rounded-[6px] px-2.5 text-[11px] font-bold transition-colors",
                    tab === entry.id
                      ? "bg-active text-ink"
                      : "text-muted hover:bg-hover hover:text-soft",
                  )}
                >
                  {entry.label}
                  {entry.id === "fills" && ledger.length > 0 ? (
                    <span className="num ml-1.5 text-[9px] text-muted">
                      {ledger.length}
                    </span>
                  ) : null}
                </button>
              ))}
              <span className="num ml-auto pr-1 text-[9px] font-semibold uppercase tracking-wider text-muted/60">
                {token.dex} · paper
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {tab === "position" ? (
                position.tokens > 0 ? (
                  <>
                    <div className="blotter-row sticky top-0 z-10 border-b border-line/70 bg-bg text-[9px] font-bold uppercase tracking-wider text-muted/70">
                      <span>Asset</span>
                      <span className="text-right">Size</span>
                      <span className="text-right">Value</span>
                      <span className="text-right">Entry</span>
                      <span className="text-right">Mark</span>
                      <span className="text-right">PnL</span>
                      <span className="text-right">Cost</span>
                    </div>
                    <div className="blotter-row text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <TokenAvatar
                          mint={token.mint}
                          symbol={token.symbol}
                          logoUrl={token.logoUrl}
                          className="size-4 rounded-[3px] text-[7px]"
                        />
                        <span className="truncate font-bold text-ink">
                          {token.symbol}
                        </span>
                      </span>
                      <span className="num truncate text-right text-soft">
                        {formatTokenAmount(position.tokens)}
                      </span>
                      <span className="num truncate text-right text-soft">
                        {formatSolAmount(positionValueSol)}
                      </span>
                      <span className="num truncate text-right text-muted">
                        {formatUsdPrice(avgEntryPriceUsd)}
                      </span>
                      <span className="num truncate text-right text-soft">
                        {formatUsdPrice(markPriceUsd)}
                      </span>
                      <span
                        className={cn(
                          "num truncate text-right font-bold",
                          toneForPnl(positionPnl),
                        )}
                      >
                        {formatPct(positionPnlPct, 1)}
                      </span>
                      <span className="num truncate text-right text-muted">
                        {formatSolAmount(position.costSol)}
                      </span>
                    </div>
                  </>
                ) : (
                  <Empty>No open position</Empty>
                )
              ) : null}

              {tab === "fills" ? (
                ledger.length > 0 ? (
                  <>
                    <div className="blotter-row sticky top-0 z-10 border-b border-line/70 bg-bg text-[9px] font-bold uppercase tracking-wider text-muted/70">
                      <span>Asset</span>
                      <span className="text-right">Side</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">SOL</span>
                      <span className="text-right">Impact</span>
                      <span className="text-right">Time</span>
                    </div>
                    {ledger.map((row) => {
                      const usd =
                        row.tokenAmount > 0
                          ? (row.solAmount / row.tokenAmount) *
                            (solPriceUsd ?? 0)
                          : null;

                      return (
                        <div
                          key={`${row.time}:${row.side}:${row.solAmount}`}
                          className="blotter-row text-[11px]"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TokenAvatar
                              mint={token.mint}
                              symbol={token.symbol}
                              logoUrl={token.logoUrl}
                              className="size-4 rounded-[3px] text-[7px]"
                            />
                            <span className="truncate font-bold text-ink">
                              {token.symbol}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "text-right font-bold uppercase",
                              row.side === "buy" ? "text-up" : "text-down",
                            )}
                          >
                            {row.side}
                          </span>
                          <span className="num truncate text-right text-soft">
                            {formatTokenAmount(row.tokenAmount)}
                          </span>
                          <span className="num truncate text-right text-soft">
                            {formatUsdPrice(usd)}
                          </span>
                          <span className="num truncate text-right text-muted">
                            {formatSolAmount(row.solAmount)}
                          </span>
                          <span className="num truncate text-right text-muted/60">
                            —
                          </span>
                          <span className="num truncate text-right text-muted/70">
                            {clock(row.time)}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <Empty>No fills on this coin yet</Empty>
                )
              ) : null}

              {tab === "market" ? (
                <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Cell label="Mint" value={token.mint} mono />
                  <Cell label="Pool" value={token.poolAddress} mono />
                  <Cell label="DEX" value={token.dex} />
                  <Cell label="Quote" value={shortAddress(token.quoteMint, 4)} mono />
                  <Cell
                    label="Liquidity"
                    value={formatCompactUsd(token.liquidityUsd)}
                  />
                  <Cell label="FDV" value={formatCompactUsd(token.fdvUsd)} />
                  <Cell
                    label="24h volume"
                    value={formatCompactUsd(token.volume24hUsd)}
                  />
                  <Cell
                    label="1h trades"
                    value={`${token.buys1h} buys · ${token.sells1h} sells`}
                  />
                  <Cell
                    label="Curve"
                    value={
                      token.graduated
                        ? "graduated"
                        : token.curveProgressPct !== null
                          ? `${Math.round(token.curveProgressPct)}% to graduation`
                          : "—"
                    }
                  />
                  <Cell label="Pool age" value={formatAge(token.createdAt)} />
                </div>
                <p className="px-3 pb-3 text-[10px] leading-relaxed text-muted/70">
                  Paper only: fills are priced off this live pool with a
                  constant-product model, so size moves the price. 1% fee plus a
                  flat priority fee per fill. No wallet, no real money.
                </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex shrink-0 flex-col justify-center border-l border-line/70 px-3">
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted/70">
        {label}
      </span>
      <span className={cn("num text-[11px] font-bold", tone ?? "text-ink")}>
        {value}
      </span>
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-[11px] font-semibold text-soft",
          mono && "num",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-[11px] font-semibold text-muted">
      {children}
    </p>
  );
}
