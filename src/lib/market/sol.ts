import { memoize } from "./cache";
import { SOL_MINT } from "./types";

const JUPITER_PRICE_URL = `https://api.jup.ag/price/v3?ids=${SOL_MINT}`;
const TIMEOUT_MS = 6_000;

type JupiterPrice = { usdPrice?: number };

/**
 * Live SOL/USD. Jupiter's price API is keyless at ~0.5 req/s, which is plenty
 * given every caller is cached; when it fails the GeckoTerminal quote price is
 * used instead (see `solPriceFromPools`).
 */
/** Cached SOL price for page renders that just need a USD conversion. */
export function getSolPriceUsd(): Promise<number | null> {
  return memoize("sol-price", 20_000, fetchSolPriceUsd, (price) => price !== null);
}

export async function fetchSolPriceUsd(): Promise<number | null> {
  try {
    const response = await fetch(JUPITER_PRICE_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Freshness is decided by the memo above, not by a platform cache that
      // could hand back the same price long after it moved.
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = (await response.json()) as Record<string, JupiterPrice>;
    const price = body?.[SOL_MINT]?.usdPrice;
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? price
      : null;
  } catch {
    return null;
  }
}
