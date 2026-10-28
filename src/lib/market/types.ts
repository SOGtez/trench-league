export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** One tradable memecoin pool, normalised from whichever feed produced it. */
export type MarketToken = {
  /** Token mint address — the id used by /coin/[mint]. */
  mint: string;
  symbol: string;
  /** Mint of the token the pool is quoted in (SOL for almost everything). */
  quoteMint: string;
  /** GeckoTerminal dex id: pump-fun, pumpswap, raydium, meteora… */
  dex: string;
  poolAddress: string;
  createdAt: string | null;
  priceUsd: number | null;
  /** Fully-diluted value. Memecoin "market cap" is the same number. */
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume1hUsd: number | null;
  volume24hUsd: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  /** Five-minute move — the fastest number the pool feed reports. */
  change5mPct: number | null;
  buys1h: number;
  sells1h: number;
  /** 0–100 for tokens still on the pump.fun bonding curve, else null. */
  curveProgressPct: number | null;
  /** True once the token left the bonding curve for an AMM pool. */
  graduated: boolean;
  /** Token art, when the feed has any. Null renders the generated badge. */
  logoUrl: string | null;
};

export type DiscoverColumns = {
  /** Newest pump.fun launches. */
  launches: MarketToken[];
  /** On the curve, closest to filling it. */
  graduating: MarketToken[];
  /** Graduated coins ranked by the feed's trending score. */
  trending: MarketToken[];
};

export type DiscoverSnapshot = {
  generatedAt: string;
  solPriceUsd: number | null;
  /** True when at least one upstream feed failed, so lists may be partial. */
  degraded: boolean;
  columns: DiscoverColumns;
};
