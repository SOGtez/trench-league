import { getPriceTicks } from "@/lib/market/ticks";

const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_MINTS = 30;

/**
 * Batched live prices for whatever is on screen. The client polls this once a
 * second for every coin in the page, so a board and a coin page cost one
 * request each — not one per row.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("mints") ?? "";

  const mints = [
    ...new Set(
      raw
        .split(",")
        .map((mint) => mint.trim())
        .filter((mint) => MINT_PATTERN.test(mint)),
    ),
  ].slice(0, MAX_MINTS);

  if (mints.length === 0) {
    return Response.json(
      { prices: {}, at: Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const prices = await getPriceTicks(mints);

  // A tick is only worth anything if it is current, so this route never asks
  // any cache to hold it.
  return Response.json(
    { prices, at: Date.now() },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
