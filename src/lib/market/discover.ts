import { memoize } from "./cache";
import {
  fetchPools,
  solPriceFromPools,
  toMarketToken,
  type GtPool,
} from "./geckoterminal";
import { getTokenLogos } from "./logos";
import { fetchSolPriceUsd } from "./sol";
import { SOL_MINT, type DiscoverSnapshot, type MarketToken } from "./types";

/**
 * How often a whole board is rebuilt. Every build is 5 GeckoTerminal requests,
 * and the documented budget is 30 req/min, so 20s (15 req/min) leaves room for
 * coin pages while the board still visibly moves.
 */
const SNAPSHOT_TTL_MS = 20_000;

const LAUNCH_LIMIT = 12;
const GRADUATING_LIMIT = 8;
const TRENDING_LIMIT = 10;
const GRADUATING_MIN_PCT = 40;

export function getDiscoverSnapshot(): Promise<DiscoverSnapshot> {
  return memoize(
    "discover",
    SNAPSHOT_TTL_MS,
    buildSnapshot,
    (snapshot) => !snapshot.degraded,
  );
}

async function buildSnapshot(): Promise<DiscoverSnapshot> {
  const [
    launchPoolsOne,
    launchPoolsTwo,
    curvePoolsOne,
    curvePoolsTwo,
    trendingPools,
    jupiterSolPrice,
  ] = await Promise.all([
    fetchPools("/networks/solana/new_pools?page=1"),
    fetchPools("/networks/solana/new_pools?page=2"),
    fetchPools("/networks/solana/dexes/pump-fun/pools?page=1&sort=h24_volume_usd_desc"),
    fetchPools("/networks/solana/dexes/pump-fun/pools?page=2&sort=h24_volume_usd_desc"),
    fetchPools("/networks/solana/trending_pools?page=1"),
    fetchSolPriceUsd(),
  ]);

  const everyPool = [
    ...(launchPoolsOne ?? []),
    ...(launchPoolsTwo ?? []),
    ...(curvePoolsOne ?? []),
    ...(curvePoolsTwo ?? []),
    ...(trendingPools ?? []),
  ];

  const solPriceUsd = jupiterSolPrice ?? solPriceFromPools(everyPool);

  const launches = byNewest(
    mapPools([...(launchPoolsOne ?? []), ...(launchPoolsTwo ?? [])], solPriceUsd, {
      dexes: ["pump-fun"],
    }),
  ).slice(0, LAUNCH_LIMIT);

  const graduating = mapPools(
    [...(curvePoolsOne ?? []), ...(curvePoolsTwo ?? [])],
    solPriceUsd,
    { dexes: ["pump-fun"] },
  )
    .filter((token) => (token.curveProgressPct ?? 0) >= GRADUATING_MIN_PCT)
    .sort((a, b) => (b.curveProgressPct ?? 0) - (a.curveProgressPct ?? 0))
    .slice(0, GRADUATING_LIMIT);

  const trending = mapPools(trendingPools ?? [], solPriceUsd, {
    quoteMint: SOL_MINT,
  }).slice(0, TRENDING_LIMIT);

  // One batched lookup for the whole board rather than one per coin.
  const logos = await getTokenLogos(
    [...launches, ...graduating, ...trending].map((token) => token.mint),
  );
  const withLogo = (token: MarketToken): MarketToken => ({
    ...token,
    logoUrl: logos[token.mint] ?? null,
  });

  return {
    generatedAt: new Date().toISOString(),
    solPriceUsd,
    degraded:
      launchPoolsOne === null ||
      curvePoolsOne === null ||
      trendingPools === null ||
      solPriceUsd === null,
    columns: {
      launches: launches.map(withLogo),
      graduating: graduating.map(withLogo),
      trending: trending.map(withLogo),
    },
  };
}

function mapPools(
  pools: GtPool[],
  solPriceUsd: number | null,
  options: { dexes?: string[]; quoteMint?: string } = {},
): MarketToken[] {
  const tokens: MarketToken[] = [];

  for (const pool of pools) {
    const token = toMarketToken(pool, solPriceUsd);
    if (!token) continue;
    if (options.dexes && !options.dexes.includes(token.dex)) continue;
    if (options.quoteMint && token.quoteMint !== options.quoteMint) continue;
    tokens.push(token);
  }

  return dedupeByMint(tokens);
}

/** One row per coin: keep the deepest pool when a mint has several. */
function dedupeByMint(tokens: MarketToken[]): MarketToken[] {
  const seen = new Map<string, MarketToken>();
  for (const token of tokens) {
    const previous = seen.get(token.mint);
    if (!previous || (token.volume24hUsd ?? 0) > (previous.volume24hUsd ?? 0)) {
      seen.set(token.mint, token);
    }
  }
  return [...seen.values()];
}

function byNewest(tokens: MarketToken[]): MarketToken[] {
  return [...tokens].sort((a, b) => {
    const left = a.createdAt ? Date.parse(a.createdAt) : 0;
    const right = b.createdAt ? Date.parse(b.createdAt) : 0;
    return right - left;
  });
}
