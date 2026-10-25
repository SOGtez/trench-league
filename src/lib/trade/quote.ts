import { PUMP_CURVE_K } from "@/lib/market/curve";
import type { MarketToken } from "@/lib/market/types";

/**
 * Paper fills are priced off the live market with a constant-product model, so
 * size actually moves the price:
 *
 *  • Bonding curve (pump-fun): reserves are derived from the live price using
 *    the curve's invariant k = 30 SOL × 1.073B tokens. That reproduces the real
 *    depth of a curve — a 5 SOL buy on a fresh launch is a huge move, the same
 *    buy on a coin at 99% is a small one.
 *  • Graduated coins: reserves come from the pool's live liquidity, with an FDV
 *    fallback when the feed has no liquidity figure.
 *
 * The fee is taken in SOL on both sides (1% matches pump.fun's trading fee and
 * stands in for pool fees after graduation), plus a flat priority fee.
 */

export const DEFAULT_FEE_BPS = 100;
export const DEFAULT_PRIORITY_FEE_SOL = 0.001;
export const MAX_IMPACT = 0.35;

export type TradeSide = "buy" | "sell";

export type TradeQuote = {
  side: TradeSide;
  /** SOL spent (buy) or received (sell), fees included. */
  solAmount: number;
  /** Tokens received (buy) or sold (sell). */
  tokenAmount: number;
  feeSol: number;
  /** Average fill price in SOL per token. */
  avgPriceSol: number;
  priceBeforeSol: number;
  priceAfterSol: number;
  /** Signed price move caused by this fill, e.g. 0.042 = +4.2%. */
  impactPct: number;
  solPriceUsd: number;
  usdValue: number;
};

export class QuoteError extends Error {}

export function swapFeeBps(): number {
  const value = Number(process.env.SWAP_FEE_BPS);
  return Number.isFinite(value) && value >= 0 && value <= 900
    ? value
    : DEFAULT_FEE_BPS;
}

export function priorityFeeSol(): number {
  const value = Number(process.env.PRIORITY_FEE_SOL);
  return Number.isFinite(value) && value >= 0 && value <= 0.1
    ? value
    : DEFAULT_PRIORITY_FEE_SOL;
}

type Reserves = { sol: number; tokens: number; onCurve: boolean };

function reservesFor(
  token: MarketToken,
  priceSol: number,
  solPriceUsd: number,
): Reserves {
  if (token.dex === "pump-fun") {
    const sol = Math.sqrt(PUMP_CURVE_K * priceSol);
    return { sol, tokens: PUMP_CURVE_K / sol, onCurve: true };
  }

  const liquiditySol = token.liquidityUsd
    ? token.liquidityUsd / 2 / solPriceUsd
    : 0;

  // No liquidity figure: assume the SOL side is ~5% of FDV, floored so a total
  // blackout cannot turn every trade into an infinite-impact fill.
  const fdv = token.fdvUsd ?? 0;
  const fallbackSol = fdv > 0 ? (fdv * 0.05) / solPriceUsd : 5;
  const sol = Math.max(liquiditySol, fallbackSol, 0.5);

  return { sol, tokens: sol / priceSol, onCurve: false };
}

export function quoteTrade({
  token,
  solPriceUsd,
  side,
  solAmount,
  tokenAmount,
}: {
  token: MarketToken;
  solPriceUsd: number | null;
  side: TradeSide;
  solAmount?: number;
  tokenAmount?: number;
}): TradeQuote {
  if (!solPriceUsd || solPriceUsd <= 0) {
    throw new QuoteError("SOL price is unavailable right now — try again.");
  }
  if (!token.priceUsd || token.priceUsd <= 0) {
    throw new QuoteError("This coin has no live price yet — try again in a moment.");
  }

  const priceSol = token.priceUsd / solPriceUsd;
  const feeRate = swapFeeBps() / 10_000;
  const priority = priorityFeeSol();
  const { sol: reserveSol, tokens: reserveTokens } = reservesFor(
    token,
    priceSol,
    solPriceUsd,
  );
  const k = reserveSol * reserveTokens;

  if (side === "buy") {
    const input = Number(solAmount ?? 0);
    if (!Number.isFinite(input) || input <= 0) {
      throw new QuoteError("Enter an amount to buy.");
    }

    const fee = input * feeRate;
    const net = input - fee - priority;
    if (net <= 0.000_001) {
      throw new QuoteError("Amount is too small to cover fees.");
    }

    const tokensOut = reserveTokens - k / (reserveSol + net);
    const priceAfter = (reserveSol + net) ** 2 / k;
    const impact = priceAfter / priceSol - 1;

    if (impact > MAX_IMPACT) {
      throw new QuoteError(
        "That buy would move the price too far — try a smaller amount.",
      );
    }

    return {
      side,
      solAmount: input,
      tokenAmount: tokensOut,
      feeSol: fee + priority,
      avgPriceSol: net / tokensOut,
      priceBeforeSol: priceSol,
      priceAfterSol: priceAfter,
      impactPct: impact,
      solPriceUsd,
      usdValue: tokensOut * token.priceUsd,
    };
  }

  const tokensIn = Number(tokenAmount ?? 0);
  if (!Number.isFinite(tokensIn) || tokensIn <= 0) {
    throw new QuoteError("Enter an amount to sell.");
  }

  const gross = reserveSol - k / (reserveTokens + tokensIn);
  const fee = gross * feeRate;
  const net = gross - fee - priority;
  if (net <= 0) {
    throw new QuoteError("Amount is too small to cover fees.");
  }

  const priceAfter = (reserveSol - gross) ** 2 / k;
  const impact = priceAfter / priceSol - 1;

  if (Math.abs(impact) > MAX_IMPACT) {
    throw new QuoteError(
      "That sell would move the price too far — try a smaller amount.",
    );
  }

  return {
    side,
    solAmount: net,
    tokenAmount: tokensIn,
    feeSol: fee + priority,
    avgPriceSol: gross / tokensIn,
    priceBeforeSol: priceSol,
    priceAfterSol: priceAfter,
    impactPct: impact,
    solPriceUsd,
    usdValue: tokensIn * token.priceUsd,
  };
}
