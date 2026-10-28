"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { executeTrade, type TradeState } from "@/app/(app)/coin/[mint]/actions";
import { FormError } from "@/components/auth/text-field";
import { AccountSwitcher } from "@/components/league/account-switcher";
import { PaperLabel } from "@/components/paper-label";
import { TradeSettingsDialog } from "@/components/coin/trade-settings";
import { Button, buttonStyles } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import type { AccountSummary } from "@/lib/leagues/active-account";
import { useLivePrices } from "@/lib/market/live-prices";
import type { MarketToken } from "@/lib/market/types";
import { QuoteError, quoteTrade, type TradeSide } from "@/lib/trade/quote";
import { playFillSound, useTradeSettings } from "@/lib/trade/settings";
import {
  cn,
  formatPct,
  formatSolAmount,
  formatTokenAmount,
  formatUsdPrice,
  toneForPnl,
} from "@/lib/utils";

const initialState: TradeState = { error: null };

export type PositionStats = {
  /** SOL put into this coin that is still held (cost basis). */
  investedSol: number;
  /** SOL received back from sells of this coin. */
  soldSol: number;
  /** Current market value of what is still held. */
  remainingSol: number;
  /** Realised + unrealised, in SOL. */
  pnlSol: number;
  pnlPct: number;
};

export function TradePanel({
  token,
  solBalance,
  positionTokens,
  positionCostSol,
  positionStats,
  solPriceUsd,
  accounts,
  activeAccountId,
  feeBps,
  priorityFeeSol,
}: {
  /** Server render snapshot; the live stream overrides its price each second. */
  token: MarketToken;
  solBalance: number;
  positionTokens: number;
  positionCostSol: number;
  positionStats: PositionStats;
  solPriceUsd: number | null;
  accounts: AccountSummary[];
  activeAccountId: string | null;
  feeBps: number;
  priorityFeeSol: number;
}) {
  const mint = token.mint;
  const symbol = token.symbol;
  const router = useRouter();
  const [state, formAction, pending] = useActionState(executeTrade, initialState);
  const { settings } = useTradeSettings();

  const [side, setSide] = useState<TradeSide>("buy");
  const [buyInput, setBuyInput] = useState("0.5");
  const [sellInput, setSellInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);
  const delayingRef = useRef(false);
  const delayTimer = useRef<number | undefined>(undefined);

  const amountInput = side === "buy" ? buyInput : sellInput;
  const amount = Number(amountInput);
  const validAmount = Number.isFinite(amount) && amount > 0;

  // The chart, the headline and this panel share one stream, so the price a
  // preview is quoted at is the price drawn on the last candle.
  const livePriceUsd = useLivePrices([mint])[mint]?.priceUsd ?? token.priceUsd;
  const pricedToken = useMemo<MarketToken>(
    () => ({ ...token, priceUsd: livePriceUsd }),
    [token, livePriceUsd],
  );

  const priceSol =
    livePriceUsd && solPriceUsd ? livePriceUsd / solPriceUsd : null;

  const refreshedFor = useRef<TradeState["filled"] | undefined>(undefined);

  useEffect(() => {
    if (!state.filled || refreshedFor.current === state.filled) return;
    refreshedFor.current = state.filled;
    trackEvent("trade_filled", { side, mint });
    if (settings.soundOn) playFillSound(state.filled.side);
    setBuyInput("");
    setSellInput("");
    router.refresh();
  }, [state.filled, router, side, mint, settings.soundOn]);

  useEffect(() => () => window.clearTimeout(delayTimer.current), []);

  const updateAmount = (value: string) => {
    if (side === "buy") setBuyInput(value);
    else setSellInput(value);
  };

  const switchSide = (next: TradeSide) => setSide(next);

  // Pricing is pure maths, so the preview runs in the browser against the live
  // price: the quote tracks the market without a round-trip, a spinner, or the
  // flicker of a cleared panel. The fill itself still prices server-side.
  const { quote, error: quoteError } = useMemo<{
    quote: ReturnType<typeof quoteTrade> | null;
    error: string | null;
  }>(() => {
    if (!validAmount) return { quote: null, error: null };

    try {
      return {
        quote: quoteTrade({
          token: pricedToken,
          solPriceUsd,
          side,
          solAmount: side === "buy" ? amount : undefined,
          tokenAmount: side === "sell" ? amount : undefined,
          feeBps,
          priorityFee: priorityFeeSol,
        }),
        error: null,
      };
    } catch (error) {
      return {
        quote: null,
        error:
          error instanceof QuoteError
            ? error.message
            : "Couldn't price that size.",
      };
    }
  }, [
    pricedToken,
    solPriceUsd,
    side,
    amount,
    validAmount,
    feeBps,
    priorityFeeSol,
  ]);

  const positionValueSol = useMemo(() => {
    if (!positionTokens || !priceSol) return 0;
    return positionTokens * priceSol;
  }, [positionTokens, priceSol]);

  const positionPnl = positionValueSol - positionCostSol;
  const positionPnlPct =
    positionCostSol > 0 ? (positionPnl / positionCostSol) * 100 : 0;

  // The server worked these out at render time. Re-deriving them from the live
  // price is what keeps the sell block moving instead of sitting still until
  // the next navigation.
  const stats: PositionStats = useMemo(() => {
    if (positionStats.investedSol <= 0) return positionStats;

    const remainingSol = priceSol
      ? positionTokens * priceSol
      : positionStats.remainingSol;
    const pnlSol =
      remainingSol + positionStats.soldSol - positionStats.investedSol;

    return {
      investedSol: positionStats.investedSol,
      soldSol: positionStats.soldSol,
      remainingSol,
      pnlSol,
      pnlPct: (pnlSol / positionStats.investedSol) * 100,
    };
  }, [positionStats, positionTokens, priceSol]);

  // A visitor without an account has no paper balance to be over, so the
  // balance warning is suppressed and the submit becomes a login prompt.
  const loggedOut = !activeAccountId;
  const overBalance = side === "buy" && !loggedOut && amount > solBalance;
  const overPosition = side === "sell" && amount > positionTokens;

  // The slippage setting is a real veto, not decoration: the quote engine knows
  // the price impact of this exact size, so anything above the tolerance is
  // caught before a fill is submitted.
  const impactPct = quote ? quote.impactPct * 100 : 0;
  const overSlippage = !!quote && Math.abs(impactPct) > settings.slippagePct;

  const blocked =
    !validAmount || overBalance || overPosition || !!quoteError || overSlippage;

  /** What 100% means for this side: the whole balance, or the whole position. */
  const sizeBasis = side === "buy" ? solBalance : positionTokens;
  const sliderPct =
    sizeBasis > 0 && validAmount
      ? Math.min(100, Math.max(0, Math.round((amount / sizeBasis) * 100)))
      : 0;

  /** Sell enough tokens to get the invested SOL back at the current price. */
  const sellInitialAmount = useMemo(() => {
    if (!priceSol || positionCostSol <= 0 || positionTokens <= 0) return null;
    const tokens = Math.min(positionTokens, positionCostSol / priceSol);
    return tokens > 0 ? tokens : null;
  }, [priceSol, positionCostSol, positionTokens]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Second pass: the guard lets the delayed submit through to the action.
    if (delayingRef.current) {
      delayingRef.current = false;
      return;
    }

    if (settings.delayMs <= 0) return;

    event.preventDefault();
    setConfirming(true);
    window.clearTimeout(delayTimer.current);
    delayTimer.current = window.setTimeout(() => {
      delayingRef.current = true;
      setConfirming(false);
      formRef.current?.requestSubmit();
    }, settings.delayMs);
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {accounts.length > 1 ? (
        <AccountSwitcher
          accounts={accounts}
          activeId={activeAccountId}
          variant="select"
        />
      ) : null}

      {/* Long/short toggle, the terminal's loudest control. */}
      <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-line bg-bg p-1">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => switchSide(option)}
            aria-pressed={side === option}
            className={cn(
              "h-8 rounded-[6px] text-[12px] font-bold transition-colors",
              side === option
                ? option === "buy"
                  ? "bg-up text-[#04140d]"
                  : "bg-down text-[#1a0c03]"
                : "text-muted hover:bg-hover hover:text-soft",
            )}
          >
            {option === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* Order type and the settings that change what a fill costs. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider">
          <span
            aria-current="true"
            className="rounded-[5px] bg-active px-1.5 py-1 text-ink"
          >
            Market
          </span>
          <button
            type="button"
            disabled
            title="Limit orders are not supported — every fill goes straight to the pool"
            className="cursor-not-allowed rounded-[5px] px-1.5 py-1 text-muted/35"
          >
            Limit
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Slippage tolerance — fills above it are refused"
            className="rounded-full border border-line px-2 py-[3px] text-[10px] font-bold text-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            Slippage {settings.slippagePct}%
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Trade settings"
            className="grid size-6 place-items-center rounded-[6px] text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.06A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.06A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.06a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.06A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <label
          htmlFor="trade-amount"
          className="text-[10px] font-bold uppercase tracking-wider text-muted"
        >
          {side === "buy" ? "Buy amount" : "Sell amount"}
        </label>
        <button
          type="button"
          onClick={() => updateAmount(String(sizeBasis || 0))}
          disabled={sizeBasis <= 0}
          className="num text-[10px] font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-muted/50"
          title="Use the whole balance"
        >
          {side === "buy"
            ? `${formatSolAmount(solBalance)} SOL`
            : `${formatTokenAmount(positionTokens)} ${symbol}`}
        </button>
      </div>

      <div className="relative">
        <input
          id="trade-amount"
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => updateAmount(event.target.value)}
          placeholder={side === "buy" ? "0.5" : "0"}
          className="num h-10 w-full rounded-[6px] border border-line bg-bg pl-2.5 pr-14 text-[14px] font-semibold text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted">
          {side === "buy" ? "SOL" : symbol}
        </span>
      </div>

      {/* One slider instead of a wall of chips: the size is continuous, and the
          percentages underneath say what the handle is pointing at. */}
      <div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderPct}
          onChange={(event) => {
            const pct = Number(event.target.value);
            updateAmount(sizeBasis > 0 ? String((sizeBasis * pct) / 100) : "");
          }}
          disabled={sizeBasis <= 0}
          aria-label={
            side === "buy" ? "Percent of SOL balance" : "Percent of position"
          }
          className="trade-slider w-full"
        />
        <div className="num flex justify-between px-0.5 text-[9px] font-semibold text-muted/60">
          {[0, 25, 50, 75, 100].map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {(side === "buy"
          ? settings.buyAmounts.slice(0, 4)
          : settings.sellPercents).map(
          (preset: number) => {
            const unaffordable =
              side === "buy"
                ? preset > solBalance
                : positionTokens <= 0;

            return (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  updateAmount(
                    String(
                      side === "buy"
                        ? preset
                        : (positionTokens * preset) / 100,
                    ),
                  )
                }
                disabled={unaffordable}
                className={cn(
                  "h-6 rounded-[5px] border border-line bg-card text-[10px] font-bold transition-colors",
                  unaffordable
                    ? "cursor-not-allowed text-muted/30"
                    : side === "buy"
                      ? "text-up hover:border-line-strong hover:bg-hover"
                      : "text-down hover:border-line-strong hover:bg-hover",
                )}
              >
                {side === "buy" ? `${preset} SOL` : `${preset}%`}
              </button>
            );
          },
        )}
      </div>

      {side === "sell" && sellInitialAmount ? (
        <button
          type="button"
          onClick={() => updateAmount(String(sellInitialAmount))}
          title="Sell the part of your position that recovers your invested SOL"
          className="h-6 w-full rounded-[5px] text-[10px] font-semibold text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          Recover initial
          <span className="num ml-1 text-muted/70">
            ({formatTokenAmount(sellInitialAmount)})
          </span>
        </button>
      ) : null}

      <dl className="space-y-0.5 rounded-[6px] border border-line bg-header px-2.5 py-1.5 text-[11px]">
        {quote ? (
          <>
            <QuoteRow
              label="Receive"
              value={
                side === "buy"
                  ? `${formatTokenAmount(quote.tokenAmount)} ${symbol}`
                  : `${formatSolAmount(quote.solAmount)} SOL`
              }
              strong
            />
            <QuoteRow
              label="Avg price"
              value={formatUsdPrice(
                quote.avgPriceSol * (quote.solPriceUsd ?? 0),
              )}
            />
            <QuoteRow
              label="Impact"
              value={formatPct(quote.impactPct * 100, 2)}
              tone={
                overSlippage
                  ? "text-down"
                  : Math.abs(quote.impactPct) > 0.05
                    ? "text-down"
                    : "text-soft"
              }
            />
            <QuoteRow label="Fees" value={`${formatSolAmount(quote.feeSol)} SOL`} />
          </>
        ) : (
          <p className="text-muted">
            {quoteError ?? "Enter an amount to see the fill."}
          </p>
        )}
      </dl>

      {side === "sell" && (positionTokens > 0 || stats.investedSol > 0) ? (
        <dl className="grid grid-cols-2 gap-1 rounded-[6px] border border-line bg-header p-1">
          <StatCell
            label="Invested"
            value={`${formatSolAmount(stats.investedSol)}`}
          />
          <StatCell
            label="Sold"
            value={stats.soldSol > 0 ? `${formatSolAmount(stats.soldSol)}` : "—"}
          />
          <StatCell label="Remaining" value={formatSolAmount(stats.remainingSol)} />
          <StatCell
            label="PnL"
            value={`${formatPct(stats.pnlPct, 1)} · ${formatSolAmount(
              Math.abs(stats.pnlSol),
            )}`}
            tone={toneForPnl(stats.pnlSol)}
          />
        </dl>
      ) : null}

      {overSlippage ? (
        <p className="text-[11px] font-semibold text-down">
          Price impact {formatPct(impactPct, 2)} is over your{" "}
          {settings.slippagePct}% slippage tolerance.
        </p>
      ) : null}
      {overBalance ? (
        <p className="text-[11px] font-semibold text-down">
          More than your {formatSolAmount(solBalance)} SOL balance.
        </p>
      ) : null}
      {overPosition ? (
        <p className="text-[11px] font-semibold text-down">
          You only hold {formatTokenAmount(positionTokens)} {symbol}.
        </p>
      ) : null}

      {loggedOut ? (
        <Link
          href={`/login?next=${encodeURIComponent(`/coin/${mint}`)}`}
          className={buttonStyles({
            variant: side === "buy" ? "buy" : "sell",
            size: "md",
            className: "w-full rounded-full",
          })}
        >
          Log in to trade
        </Link>
      ) : (
        <form ref={formRef} action={formAction} onSubmit={handleSubmit}>
          <input type="hidden" name="mint" value={mint} />
          <input type="hidden" name="side" value={side} />
          <input type="hidden" name="amount" value={validAmount ? amount : 0} />
          <Button
            type="submit"
            variant={side === "buy" ? "buy" : "sell"}
            size="md"
            className="w-full rounded-full"
            disabled={pending || confirming || blocked}
          >
            {confirming
              ? "Confirming…"
              : pending
                ? "Filling…"
                : side === "buy"
                  ? `Buy ${symbol} · ${formatSolAmount(amount || 0)} SOL`
                  : `Sell ${formatTokenAmount(amount || 0)} ${symbol}`}
          </Button>
        </form>
      )}

      {state.error ? <FormError>{state.error}</FormError> : null}

      {state.filled ? (
        <div
          role="status"
          className="rounded-[6px] border border-up/30 bg-up/10 px-2.5 py-2 text-[11px] font-medium text-up"
        >
          {state.filled.side === "buy" ? "Bought" : "Sold"}{" "}
          {formatTokenAmount(state.filled.tokenAmount)} {state.filled.symbol} for{" "}
          {formatSolAmount(state.filled.solAmount)} SOL ·{" "}
          {formatPct(state.filled.impactPct * 100, 2)} impact
        </div>
      ) : null}

      {/* Account strip, where the reference shows margin and buying power. */}
      <dl className="grid grid-cols-3 gap-1 rounded-[6px] border border-line bg-header p-1">
        <StatCell label="Available" value={formatSolAmount(solBalance)} />
        <StatCell label="Position" value={formatSolAmount(positionValueSol)} />
        <StatCell
          label="PnL"
          value={
            positionTokens > 0
              ? `${formatPct(positionPnlPct, 1)}`
              : "—"
          }
          tone={positionTokens > 0 ? toneForPnl(positionPnl) : "text-muted"}
        />
      </dl>

      <div className="flex justify-center">
        <PaperLabel />
      </div>

      {settingsOpen ? (
        <TradeSettingsDialog
          onClose={() => setSettingsOpen(false)}
          feeBps={feeBps}
          priorityFeeSol={priorityFeeSol}
        />
      ) : null}
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-[5px] bg-card px-1.5 py-1">
      <dt className="text-[9px] font-bold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "num mt-0.5 truncate text-[11px] font-bold",
          tone ?? "text-soft",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function QuoteRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "num font-semibold",
          tone ?? (strong ? "text-ink" : "text-soft"),
        )}
      >
        {value}
      </dd>
    </div>
  );
}
