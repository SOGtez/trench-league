import { shortAddress } from "@/lib/utils";

import { memoize } from "./cache";
import { curveProgressPct } from "./curve";
import { fetchPools, solPriceFromPools, toMarketToken } from "./geckoterminal";
import { getTokenLogos } from "./logos";
import { fetchSolPriceUsd } from "./sol";
import { SOL_MINT, type MarketToken } from "./types";

export type TokenSnapshot = {
  token: MarketToken;
  solPriceUsd: number | null;
  source: "geckoterminal" | "dexscreener";
};

const TTL_MS = 10_000;

/**
 * Everything the coin page and the trade engine need for one mint: live price,
 * liquidity, FDV, curve progress and the pool used for candles.
 *
 * GeckoTerminal is primary (it has curve progress), but it rate limits at
 * 30 req/min per IP, and a busy board plus a few open coin pages can reach that.
 * Dexscreener answers the same question from a separate budget, so the coin
 * page and the trade panel keep working through a GeckoTerminal 429.
 */
export function getTokenSnapshot(mint: string): Promise<TokenSnapshot | null> {
  return memoize(`token:${mint}`, TTL_MS, async () => {
    const jupiterSolPrice = await fetchSolPriceUsd();
    const snapshot =
      (await viaGeckoTerminal(mint, jupiterSolPrice)) ??
      (await viaDexscreener(mint, jupiterSolPrice));

    if (!snapshot) return null;

    const logos = await getTokenLogos([mint]);
    return {
      ...snapshot,
      token: { ...snapshot.token, logoUrl: logos[mint] ?? null },
    };
  });
}

async function viaGeckoTerminal(
  mint: string,
  jupiterSolPrice: number | null,
): Promise<TokenSnapshot | null> {
  const pools = await fetchPools(`/networks/solana/tokens/${mint}/pools?page=1`);
  if (!pools || pools.length === 0) return null;

  const solPriceUsd = jupiterSolPrice ?? solPriceFromPools(pools);
  const tokens = pools
    .map((pool) => toMarketToken(pool, solPriceUsd))
    .filter((token): token is MarketToken => token !== null)
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));

  const token = tokens[0];
  if (!token) return null;

  return { token, solPriceUsd, source: "geckoterminal" };
}

type DexPair = {
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string };
  priceUsd?: string;
  priceNative?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h1?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  txns?: { h1?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
};

function mapDex(dexId: string | undefined): string {
  if (!dexId) return "unknown";
  if (dexId === "pumpfun") return "pump-fun";
  return dexId;
}

async function viaDexscreener(
  mint: string,
  jupiterSolPrice: number | null,
): Promise<TokenSnapshot | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${mint}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;

    const pairs = (await response.json()) as DexPair[];
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    const pair = pairs
      .filter((entry) => Number(entry.priceUsd) > 0)
      .sort(
        (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
      )[0];
    if (!pair) return null;

    const priceUsd = Number(pair.priceUsd);
    const priceNative = Number(pair.priceNative);
    const solPriceUsd =
      jupiterSolPrice ??
      (priceNative > 0 ? priceUsd / priceNative : null);

    const dex = mapDex(pair.dexId);
    const fdvUsd = Number(pair.marketCap ?? pair.fdv) || null;
    const onCurve = dex === "pump-fun";

    const token: MarketToken = {
      mint,
      symbol: pair.baseToken?.symbol ?? shortAddress(mint, 4),
      quoteMint: pair.quoteToken?.address ?? SOL_MINT,
      dex,
      poolAddress: pair.pairAddress ?? mint,
      createdAt: pair.pairCreatedAt
        ? new Date(pair.pairCreatedAt).toISOString()
        : null,
      priceUsd,
      fdvUsd,
      liquidityUsd: Number(pair.liquidity?.usd) || null,
      volume1hUsd: Number(pair.volume?.h1) || null,
      volume24hUsd: Number(pair.volume?.h24) || null,
      change1hPct: Number.isFinite(pair.priceChange?.h1)
        ? Number(pair.priceChange?.h1)
        : null,
      change24hPct: Number.isFinite(pair.priceChange?.h24)
        ? Number(pair.priceChange?.h24)
        : null,
      change5mPct: Number.isFinite(pair.priceChange?.m5)
        ? Number(pair.priceChange?.m5)
        : null,
      buys1h: pair.txns?.h1?.buys ?? 0,
      sells1h: pair.txns?.h1?.sells ?? 0,
      curveProgressPct: onCurve ? curveProgressPct(fdvUsd, solPriceUsd) : null,
      graduated: !onCurve,
      logoUrl: null,
    };

    return { token, solPriceUsd, source: "dexscreener" };
  } catch {
    return null;
  }
}
