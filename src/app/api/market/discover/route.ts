import { getDiscoverSnapshot } from "@/lib/market/discover";

/**
 * Polled by the Discover board. The market layer memoises upstream calls for
 * 30s, and the CDN holds this response briefly, so many tabs cost almost
 * nothing upstream.
 */
export async function GET() {
  const snapshot = await getDiscoverSnapshot();

  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
    },
  });
}
