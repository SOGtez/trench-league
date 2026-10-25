"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { executeTrade, type TradeState } from "@/app/(app)/coin/[mint]/actions";
import { FormError } from "@/components/auth/text-field";
import { PaperLabel } from "@/components/paper-label";
import { Button } from "@/components/ui/button";
import type { TradeQuote, TradeSide } from "@/lib/trade/quote";
import {
  cn,
  formatPct,
  formatSolAmount,
  formatTokenAmount,
  formatUsdPrice,
  toneForPnl,
} from "@/lib/utils";

const BUY_PRESETS = [0.1, 0.5, 1, 2];
const SELL_PRESETS = [25, 50, 100];

const initialState: TradeState = { error: null };

export function TradePanel({
  mint,
  symbol,
  solBalance,
  positionTokens,
  positionCostSol,
  priceUsd,
  solPriceUsd,
}: {
  mint: string;
  symbol: string;
  solBalance: number;
  positionTokens: number;
  positionCostSol: number;
  priceUsd: number | null;
  solPriceUsd: number | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(executeTrade, initialState);

  const [side, setSide] = useState<TradeSide>("buy");
  const [buyInput, setBuyInput] = useState("0.5");
  const [sellInput, setSellInput] = useState("");
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const amountInput = side === "buy" ? buyInput : sellInput;
  const amount = Number(amountInput);
  const validAmount = Number.isFinite(amount) && amount > 0;

  const refreshedFor = useRef<TradeState["filled"] | undefined>(undefined);

  useEffect(() => {
    if (!state.filled || refreshedFor.current === state.filled) return;
    refreshedFor.current = state.filled;
    setBuyInput("");
    setSellInput("");
    setQuote(null);
    setQuoteError(null);
    router.refresh();
  }, [state.filled, router]);

  const updateAmount = (value: string) => {
    if (side === "buy") setBuyInput(value);
    else setSellInput(value);
    setQuote(null);
    setQuoteError(null);
  };

  const switchSide = (next: TradeSide) => {
    setSide(next);
    setQuote(null);
    setQuoteError(null);
  };

  // Live preview from the same pricing code the fill uses.
  useEffect(() => {
    if (!validAmount) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuoting(true);

      try {
        const response = await fetch(
          `/api/trade/quote?mint=${encodeURIComponent(mint)}&side=${side}&amount=${amount}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = (await response.json()) as {
          quote?: TradeQuote;
          error?: string;
        };

        if (controller.signal.aborted) return;

        if (!response.ok || !body.quote) {
          setQuote(null);
          setQuoteError(body.error ?? "Couldn't price that size.");
          return;
        }

        setQuote(body.quote);
        setQuoteError(null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setQuote(null);
          setQuoteError("Quote unavailable — try again.");
        }
      } finally {
        if (!controller.signal.aborted) setQuoting(false);
      }
    }, 320);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mint, side, amount, validAmount]);

  const positionValueSol = useMemo(() => {
    if (!positionTokens || !priceUsd || !solPriceUsd) return 0;
    return (positionTokens * priceUsd) / solPriceUsd;
  }, [positionTokens, priceUsd, solPriceUsd]);

  const positionPnl = positionValueSol - positionCostSol;
  const positionPnlPct =
    positionCostSol > 0 ? (positionPnl / positionCostSol) * 100 : 0;

  const overBalance = side === "buy" && amount > solBalance;
  const overPosition = side === "sell" && amount > positionTokens;

  const blocked = !validAmount || overBalance || overPosition || !!quoteError;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-header p-1">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => switchSide(option)}
            aria-pressed={side === option}
            className={cn(
              "h-9 rounded-full text-[13px] font-bold capitalize transition-colors",
              side === option
                ? option === "buy"
                  ? "bg-up text-[#04140d]"
                  : "bg-down text-[#1a0c03]"
                : "text-muted hover:text-soft",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <label
          htmlFor="trade-amount"
          className="text-[11px] font-bold uppercase tracking-wider text-muted"
        >
          {side === "buy" ? "Amount (SOL)" : "Amount (tokens)"}
        </label>
        <span className="num text-[11px] text-muted">
          {side === "buy"
            ? `${formatSolAmount(solBalance)} SOL`
            : `${formatTokenAmount(positionTokens)} ${symbol}`}
        </span>
      </div>

      <input
        id="trade-amount"
        inputMode="decimal"
        value={amountInput}
        onChange={(event) => updateAmount(event.target.value)}
        placeholder={side === "buy" ? "0.5" : "0"}
        className="num mt-2 h-12 w-full rounded-[12px] border border-line bg-bg px-3.5 text-[15px] font-semibold text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
      />

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {side === "buy"
          ? BUY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => updateAmount(String(preset))}
                className="h-9 rounded-[10px] border border-line bg-card text-[12px] font-semibold text-soft transition-colors hover:border-line-strong hover:bg-hover"
              >
                {preset}
              </button>
            ))
          : SELL_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  updateAmount(String((positionTokens * preset) / 100))
                }
                className="h-9 rounded-[10px] border border-line bg-card text-[12px] font-semibold text-soft transition-colors hover:border-line-strong hover:bg-hover"
              >
                {preset}%
              </button>
            ))}
      </div>

      <div className="mt-4 rounded-[12px] border border-line bg-header px-3.5 py-3 text-[12px]">
        {quote ? (
          <dl className="space-y-1.5">
            <QuoteRow
              label={side === "buy" ? "You receive" : "You get"}
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
              label="Price impact"
              value={formatPct(quote.impactPct * 100, 2)}
              tone={
                Math.abs(quote.impactPct) > 0.05 ? "text-down" : "text-soft"
              }
            />
            <QuoteRow label="Fees" value={`${formatSolAmount(quote.feeSol)} SOL`} />
          </dl>
        ) : (
          <p className="text-muted">
            {quoting
              ? "Pricing…"
              : quoteError
                ? quoteError
                : validAmount
                  ? "No quote yet."
                  : "Enter an amount to see the fill."}
          </p>
        )}
      </div>

      {overBalance ? (
        <p className="mt-2 text-[12px] font-semibold text-down">
          That is more than your {formatSolAmount(solBalance)} SOL balance.
        </p>
      ) : null}
      {overPosition ? (
        <p className="mt-2 text-[12px] font-semibold text-down">
          You only hold {formatTokenAmount(positionTokens)} {symbol}.
        </p>
      ) : null}

      <form action={formAction} className="mt-4">
        <input type="hidden" name="mint" value={mint} />
        <input type="hidden" name="side" value={side} />
        <input type="hidden" name="amount" value={validAmount ? amount : 0} />
        <Button
          type="submit"
          variant={side === "buy" ? "buy" : "sell"}
          size="lg"
          className="w-full"
          disabled={pending || blocked}
        >
          {pending
            ? "Filling…"
            : side === "buy"
              ? `Buy ${symbol} with ${formatSolAmount(amount || 0)} SOL`
              : `Sell ${formatTokenAmount(amount || 0)} ${symbol}`}
        </Button>
      </form>

      {state.error ? <div className="mt-3"><FormError>{state.error}</FormError></div> : null}

      {state.filled ? (
        <div
          role="status"
          className="mt-3 rounded-[12px] border border-up/30 bg-up/10 px-3.5 py-3 text-[12px] font-medium text-up"
        >
          {state.filled.side === "buy" ? "Bought" : "Sold"}{" "}
          {formatTokenAmount(state.filled.tokenAmount)} {state.filled.symbol} for{" "}
          {formatSolAmount(state.filled.solAmount)} SOL ·{" "}
          {formatPct(state.filled.impactPct * 100, 2)} impact
        </div>
      ) : null}

      <div className="mt-4 flex justify-center">
        <PaperLabel />
      </div>

      <div className="mt-4 border-t border-line pt-3.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-muted">Your position</span>
          <span className="num font-bold text-ink">
            {formatTokenAmount(positionTokens)} {symbol}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[12px]">
          <span className="text-muted">
            {formatSolAmount(positionValueSol)} SOL value
          </span>
          <span className={cn("num font-semibold", toneForPnl(positionPnl))}>
            {positionTokens > 0
              ? `${formatPct(positionPnlPct, 1)} · ${formatSolAmount(Math.abs(positionPnl))} SOL`
              : "—"}
          </span>
        </div>
      </div>
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
