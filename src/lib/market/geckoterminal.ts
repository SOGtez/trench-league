import { shortAddress } from "@/lib/utils";

import { curveProgressPct } from "./curve";
import { SOL_MINT, type MarketToken } from "./types";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const TIMEOUT_MS = 8_000;

/**
 * GeckoTerminal pool object (the subset we read). Values arrive as strings and
 * any of them may be null for a brand-new pool.
 */
export type GtPool = {
  id: string;
  attributes: {
    address?: string | null;
    name?: string | null;
    pool_created_at?: string | null;
    base_token_price_usd?: string | null;
    quote_token_price_usd?: string | null;
    fdv_usd?: string | null;
    market_cap_usd?: string | null;
    reserve_in_usd?: string | null;
    price_change_percentage?: Record<string, string | null> | null;
    volume_usd?: Record<string, string | null> | null;
    transactions?: Record<
      string,
      { buys?: number; sells?: number } | null
    > | null;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
};

type GtListResponse = { data?: GtPool[] };

export async function fetchPools(path: string): Promise<GtPool[] | null> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // The in-memory memo in cache.ts already collapses requests. A second,
      // platform-level cache here used to outlive every TTL we control and pin
      // a board to a minutes-old snapshot, so the fetch stays uncached and the
      // memo is the only thing deciding freshness.
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = (await response.json()) as GtListResponse;
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return null;
  }
}

/** Candles for a pool, oldest first. GeckoTerminal sends them newest first. */
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function fetchCandles(
  poolAddress: string,
  timeframe: "minute" | "hour" | "day",
  aggregate: number,
  limit = 150,
): Promise<Candle[] | null> {
  try {
    const response = await fetch(
      `${BASE_URL}/networks/solana/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Same reasoning as fetchPools: the TTL that decides how old a candle
        // may be lives in the route, not in an opaque platform cache.
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    const body = (await response.json()) as {
      data?: { attributes?: { ohlcv_list?: number[][] } };
    };
    const list = body.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list)) return null;

    const candles = list
      .map((row): Candle | null => {
        const [time, open, high, low, close, volume] = row;
        if (![time, open, high, low, close].every(Number.isFinite)) return null;
        return { time, open, high, low, close, volume: volume ?? 0 };
      })
      .filter((candle): candle is Candle => candle !== null);

    // The ohlcv feed occasionally repeats the still-forming bucket, and the
    // chart rejects duplicate timestamps outright (setData throws, leaving an
    // empty plot). Keep the latest copy of each bucket, in time order.
    const byTime = new Map<number, Candle>();
    for (const candle of candles) byTime.set(candle.time, candle);

    return [...byTime.values()].sort((a, b) => a.time - b.time);
  } catch {
    return null;
  }
}

function relationshipId(
  relationship: { data?: { id?: string } } | undefined,
): string | null {
  return relationship?.data?.id ?? null;
}

function stripChain(id: string | null): string | null {
  if (!id) return null;
  return id.startsWith("solana_") ? id.slice("solana_".length) : id;
}

function numeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function symbolFromName(name: string | null | undefined, mint: string): string {
  const head = (name ?? "").split(" / ")[0].trim();
  if (!head || head === "." || head.length > 24) return shortAddress(mint, 4);
  return head;
}

/** SOL price implied by any SOL-quoted pool — fallback when Jupiter is down. */
export function solPriceFromPools(pools: GtPool[]): number | null {
  for (const pool of pools) {
    if (relationshipId(pool.relationships?.quote_token) !== `solana_${SOL_MINT}`) {
      continue;
    }
    const price = numeric(pool.attributes.quote_token_price_usd);
    if (price && price > 0) return price;
  }
  return null;
}

export function toMarketToken(
  pool: GtPool,
  solPriceUsd: number | null,
): MarketToken | null {
  const mint = stripChain(relationshipId(pool.relationships?.base_token));
  if (!mint) return null;

  const quoteMint = stripChain(relationshipId(pool.relationships?.quote_token)) ?? "";
  const dex = relationshipId(pool.relationships?.dex) ?? "unknown";
  const attributes = pool.attributes;

  const fdvUsd = numeric(attributes.fdv_usd) ?? numeric(attributes.market_cap_usd);
  const transactions = attributes.transactions?.h1 ?? null;
  const onCurve = dex === "pump-fun" && quoteMint === SOL_MINT;

  return {
    mint,
    symbol: symbolFromName(attributes.name, mint),
    quoteMint,
    dex,
    poolAddress: attributes.address ?? pool.id,
    createdAt: attributes.pool_created_at ?? null,
    priceUsd: numeric(attributes.base_token_price_usd),
    fdvUsd,
    liquidityUsd: numeric(attributes.reserve_in_usd),
    volume1hUsd: numeric(attributes.volume_usd?.h1),
    volume24hUsd: numeric(attributes.volume_usd?.h24),
    change1hPct: numeric(attributes.price_change_percentage?.h1),
    change24hPct: numeric(attributes.price_change_percentage?.h24),
    change5mPct: numeric(attributes.price_change_percentage?.m5),
    buys1h: transactions?.buys ?? 0,
    sells1h: transactions?.sells ?? 0,
    curveProgressPct: onCurve ? curveProgressPct(fdvUsd, solPriceUsd) : null,
    graduated: dex !== "pump-fun",
    // Pool feeds carry no art; discover.ts and token.ts attach it in one batch.
    logoUrl: null,
  };
}
