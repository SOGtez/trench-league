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
  // on purpose: GeckoTerminal allows 30 req/min, so 4s (15 req/min) leaves room
  // for the pool lookup while keeping the newest bucket a few seconds old.
  const candles = await memoize(
    `candles:${pool.address}:${key}`,
    4_000,
    async () => {
      const data = await fetchCandles(
        pool.address,
        spec.timeframe,
        spec.aggregate,
        150,
      );
      if (!data) throw new Error("candles_unavailable");
      return data;
    },
  ).catch(() => null);

  if (!candles) {
    return Response.json(
      { error: "Candles unavailable for this pool." },
      { status: 502 },
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
