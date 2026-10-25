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
  const snapshot = await getTokenSnapshot(mint);

  if (!snapshot) {
    return Response.json({ error: "Unknown coin." }, { status: 404 });
  }

  // Throwing lets the memo serve the last good candle set through a rate-limit
  // blip instead of blanking a chart that was already drawn.
  const candles = await memoize(
    `candles:${snapshot.token.poolAddress}:${key}`,
    20_000,
    async () => {
      const data = await fetchCandles(
        snapshot.token.poolAddress,
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

  return Response.json(
    { candles, dex: snapshot.token.dex },
    {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    },
  );
}
