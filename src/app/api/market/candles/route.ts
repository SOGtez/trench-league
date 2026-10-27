import { memoize } from "@/lib/market/cache";
import { fetchCandles } from "@/lib/market/geckoterminal";
import { getTokenSnapshot } from "@/lib/market/token";

const TIMEFRAMES = {
  "1m": { timeframe: "minute", aggregate: 1 },
  "5m": { timeframe: "minute", aggregate: 5 },
  "15m": { timeframe: "minute", aggregate: 15 },
  "1h": { timeframe: "hour", aggregate: 1 },
} as const;

type Timeframe = keyof typeof TIMEFRAMES;

/**
 * Last good candle set per pool and timeframe.
 *
 * GeckoTerminal allows 30 requests a minute, and on Vercel that budget is shared
 * with everything else leaving the same egress address, so a throttled answer
 * arrives from time to time no matter how careful this route is. Keeping the
 * previous set means a throttled poll still paints a chart — one that is at most
 * a bucket old — instead of handing the page an error and a blank plot.
 */
const lastGood = new Map<string, { candles: Awaited<ReturnType<typeof fetchCandles>>; dex: string; at: number }>();
const LAST_GOOD_TTL_MS = 10 * 60_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mint = url.searchParams.get("mint")?.trim() ?? "";
  const key = (url.searchParams.get("tf") ?? "1m") as Timeframe;

  if (!mint) {
    return Response.json({ error: "Missing mint." }, { status: 400 });
  }

  const spec = TIMEFRAMES[key] ?? TIMEFRAMES["1m"];

  // A coin's pool does not move, but resolving it costs a GeckoTerminal call.
  // Caching the pool far longer than the snapshot keeps a 30s chart poll from
  // spending the whole rate-limit budget on lookups.
  const pool = await memoize(`pool:${mint}`, 5 * 60_000, async () => {
    const snapshot = await getTokenSnapshot(mint);
    return snapshot
      ? { address: snapshot.token.poolAddress, dex: snapshot.token.dex }
      : null;
  });

  if (!pool) {
    return Response.json({ error: "Unknown coin." }, { status: 404 });
  }

  // Throwing lets the memo serve the last good candle set through a rate-limit
  // blip instead of blanking a chart that was already drawn. The TTL is short
  // on purpose: GeckoTerminal allows 30 req/min, so 8s (7.5 req/min) leaves room
  // for the pool lookup while keeping the newest bucket a few seconds old — and
  // the bar that is still forming is redrawn every second from the tick stream
  // anyway, so this poll only has to refresh finished buckets.
  const cacheKey = `candles:${pool.address}:${key}`;
  const candles = await memoize(
    cacheKey,
    8_000,
    async () => {
      const data = await fetchCandles(
        pool.address,
        spec.timeframe,
        spec.aggregate,
        150,
      );
      if (!data) throw new Error("candles_unavailable");

      lastGood.set(cacheKey, { candles: data, dex: pool.dex, at: Date.now() });
      return data;
    },
  ).catch(() => null);

  if (!candles) {
    const previous = lastGood.get(cacheKey);
    const usable = previous && Date.now() - previous.at < LAST_GOOD_TTL_MS;

    if (!usable) {
      return Response.json(
        { error: "Candles unavailable for this pool." },
        { status: 502 },
      );
    }

    // Stale beats blank: the chart keeps its history and its retry loop refills
    // it as soon as the upstream budget frees up.
    return Response.json(
      {
        candles: previous.candles,
        dex: previous.dex,
        at: previous.at,
        stale: true,
      },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
          "X-Candles-Stale": "1",
        },
      },
    );
  }

  // A shared cache in front of this route would hand every tab the same old
  // snapshot for as long as it liked, which is exactly the freeze this route
  // used to show. The chart polls it every second; the memo is the only cache.
  return Response.json(
    { candles, dex: pool.dex, at: Date.now() },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
