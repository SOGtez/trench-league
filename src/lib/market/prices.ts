import { memoize } from "./cache";

export type LivePrice = {
  priceUsd: number | null;
  fdvUsd: number | null;
  change1hPct: number | null;
};

type DexscreenerPair = {
  baseToken?: { address?: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  priceChange?: { h1?: number };
};

const CHUNK = 25;
const TTL_MS = 15_000;

/**
 * One batched request per portfolio load instead of one per position —
 * GeckoTerminal's per-token endpoints would blow the 30 req/min budget.
 */
export function getLivePrices(
  mints: string[],
): Promise<Record<string, LivePrice>> {
  const unique = [...new Set(mints.filter(Boolean))].sort();
  if (unique.length === 0) return Promise.resolve({});

  return memoize(`prices:${unique.join(",")}`, TTL_MS, async () => {
    const best = new Map<
      string,
      { pair: DexscreenerPair; liquidity: number }
    >();

    for (let index = 0; index < unique.length; index += CHUNK) {
      const batch = unique.slice(index, index + CHUNK);

      try {
        const response = await fetch(
          `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`,
          {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(8_000),
            next: { revalidate: 15 },
          },
        );

        if (!response.ok) continue;

        const pairs = (await response.json()) as DexscreenerPair[];

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
        // A missing batch just leaves those positions unpriced.
      }
    }

    const result: Record<string, LivePrice> = {};
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
  });
}
