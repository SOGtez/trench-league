import { getTokenSnapshot } from "@/lib/market/token";
import { quoteTrade, QuoteError, type TradeSide } from "@/lib/trade/quote";

/**
 * Powers the buy/sell panel's live preview. Uses the same pricing code as the
 * fill itself, so what the panel shows is what the account gets.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mint = url.searchParams.get("mint")?.trim() ?? "";
  const side = url.searchParams.get("side") as TradeSide | null;
  const amount = Number(url.searchParams.get("amount") ?? 0);

  if (!mint || (side !== "buy" && side !== "sell")) {
    return Response.json({ error: "Missing mint or side." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "Enter an amount." }, { status: 400 });
  }

  const snapshot = await getTokenSnapshot(mint);
  if (!snapshot) {
    return Response.json(
      { error: "No live price for this coin yet." },
      { status: 404 },
    );
  }

  try {
    const quote = quoteTrade({
      token: snapshot.token,
      solPriceUsd: snapshot.solPriceUsd,
      side,
      solAmount: side === "buy" ? amount : undefined,
      tokenAmount: side === "sell" ? amount : undefined,
    });

    return Response.json(
      {
        quote,
        symbol: snapshot.token.symbol,
        curveProgressPct: snapshot.token.curveProgressPct,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof QuoteError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
