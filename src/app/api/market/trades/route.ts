import { memoize } from "@/lib/market/cache";
import { fetchTrades, type PoolTrade } from "@/lib/market/geckoterminal";
import { getTokenSnapshot } from "@/lib/market/token";

/**
 * Last good tape per pool.
 *
 * The trade endpoint shares GeckoTerminal's 30 req/min budget with candles and
 * snapshots, so a throttled poll is routine. A tape that is a few seconds old
 * still reads correctly; an empty one looks like a dead pool.
 */
const lastGood = new Map<string, { trades: PoolTrade[]; dex: string; at: number }>();
const LAST_GOOD_TTL_MS = 10 * 60_000;

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint")?.trim() ?? "";
  if (!mint) {
    return Response.json({ error: "Missing mint." }, { status: 400 });
  }

  // Same key shape as the candles route: a coin's pool never moves, and
  // resolving it is itself an upstream call.
  const pool = await memoize(`pool:${mint}`, 5 * 60_000, async () => {
    const snapshot = await getTokenSnapshot(mint);
    return snapshot
      ? { address: snapshot.token.poolAddress, dex: snapshot.token.dex }
      : null;
  });

  if (!pool) {
    return Response.json({ error: "Unknown coin." }, { status: 404 });
  }

  // 6s TTL: a 4s client poll still costs fewer than 10 upstream requests a
  // minute, which leaves room for candles on the same budget.
  const cacheKey = `trades:${pool.address}`;
  const trades = await memoize(
    cacheKey,
    6_000,
    async () => {
      const data = await fetchTrades(pool.address, 40);
      if (!data) throw new Error("trades_unavailable");
      lastGood.set(cacheKey, { trades: data, dex: pool.dex, at: Date.now() });
      return data;
    },
  ).catch(() => null);

  if (!trades) {
    const previous = lastGood.get(cacheKey);
    const usable = previous && Date.now() - previous.at < LAST_GOOD_TTL_MS;

    if (!usable) {
      return Response.json(
        { error: "Trades unavailable for this pool." },
        { status: 502 },
      );
    }

    return Response.json(
      { trades: previous.trades, dex: previous.dex, at: previous.at, stale: true },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
          "X-Trades-Stale": "1",
        },
      },
    );
  }

  return Response.json(
    { trades, dex: pool.dex, at: Date.now() },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
