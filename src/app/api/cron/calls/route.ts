import { ensureOpenRound } from "@/lib/calls/rounds";
import { settleDueCalls } from "@/lib/calls/settle";
import { isTradingConfigured } from "@/lib/supabase/env";

/**
 * Scheduled scoring.
 *
 * Optional: the Calls board already settles and opens rounds as a side effect
 * of being polled, so the game works with nobody configuring anything. This
 * route exists so a round still resolves on time with no tabs open — point a
 * cron at it (Vercel Cron on a Pro plan: every 5 minutes) and set
 * `CRON_SECRET`, which Vercel sends as a bearer token automatically.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Without a secret this route would be a free endpoint for anyone to hammer.
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isTradingConfigured()) {
    return Response.json(
      { error: "Trading isn't configured on the server." },
      { status: 503 },
    );
  }

  const settled = await settleDueCalls();
  const roundId = await ensureOpenRound();

  return Response.json(
    { settled, roundId, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
