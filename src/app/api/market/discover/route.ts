import { getDiscoverSnapshot } from "@/lib/market/discover";

// Never prerender or cache this at the edge: a shared cache can hand a tab an
// older board than the server already has in memory, which freezes the page.
export const dynamic = "force-dynamic";

/**
 * Polled by the Discover board. The market layer memoises upstream calls, so
 * many tabs collapse onto one set of feed requests without a CDN copy.
 */
export async function GET() {
  const snapshot = await getDiscoverSnapshot();

  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
