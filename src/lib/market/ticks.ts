import { memoize } from "./cache";

export type PriceTick = {
  priceUsd: number;
  fdvUsd: number | null;
  change1hPct: number | null;
};

type DexPair = {
  baseToken?: { address?: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  priceChange?: { h1?: number };
};

/** Dexscreener accepts up to 30 addresses per call — that is what makes 1s viable. */
const CHUNK = 25;
const TIMEOUT_MS = 4_000;

/**
 * Slightly under the client's poll period, so each poll lands on a fresh
 * upstream read instead of asking for the previous one twice.
 */
const TTL_MS = 900;

/**
 * Batched 1s price ticks.
 *
 * Every caller on the same instance shares one upstream request per tick, so a
 * board of 30 coins costs the same as one coin page. Dexscreener is used here
 * rather than GeckoTerminal because its bulk token endpoint answers 25 addresses
 * at once and it allows ~300 req/min — enough for a 1s cadence, where
 * GeckoTerminal's 30 req/min would be exhausted in half a minute.
 */
export function getPriceTicks(
  mints: string[],
): Promise<Record<string, PriceTick>> {
  const unique = [...new Set(mints.filter(Boolean))].sort();
  if (unique.length === 0) return Promise.resolve({});

  return memoize(
    `ticks:${unique.join(",")}`,
    TTL_MS,
    () => fetchTicks(unique),
    (ticks) => Object.keys(ticks).length > 0,
  );
}

async function fetchTicks(mints: string[]): Promise<Record<string, PriceTick>> {
  const best = new Map<string, { pair: DexPair; liquidity: number }>();

  const batches: string[][] = [];
  for (let index = 0; index < mints.length; index += CHUNK) {
    batches.push(mints.slice(index, index + CHUNK));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const response = await fetch(
          `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`,
          {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            // Never let a cached read stand in for a tick: the whole point of
            // this endpoint is that it is current.
            cache: "no-store",
          },
        );

        if (!response.ok) return;

        const pairs = (await response.json()) as DexPair[];

        for (const pair of pairs ?? []) {
          const mint = pair.baseToken?.address;
          const price = Number(pair.priceUsd);
          if (!mint || !Number.isFinite(price) || price <= 0) continue;

          const liquidity = Number(pair.liquidity?.usd ?? 0);
          const current = best.get(mint);
          if (!current || liquidity > current.liquidity) {
            best.set(mint, { pair, liquidity });
          }
        }
      } catch {
        // A failed batch just leaves those coins unpriced for this tick.
      }
    }),
  );

  const result: Record<string, PriceTick> = {};
  for (const [mint, { pair }] of best) {
    result[mint] = {
      priceUsd: Number(pair.priceUsd),
      fdvUsd: Number(pair.marketCap ?? pair.fdv) || null,
      change1hPct: Number.isFinite(pair.priceChange?.h1)
        ? Number(pair.priceChange?.h1)
        : null,
    };
  }

  return result;
}
