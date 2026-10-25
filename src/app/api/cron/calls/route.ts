import { timingSafeEqual } from "node:crypto";

import { ensureOpenRound } from "@/lib/calls/rounds";
import { settleDueCalls } from "@/lib/calls/settle";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";

/**
 * Scheduled scoring.
 *
 * Optional: the Calls board settles and opens rounds as a side effect of being
 * polled, so the game works with nobody configuring anything. This route exists
 * so a round still resolves on time with no tabs open, and something fires it
 * every 5 minutes — `0005_cron.sql` schedules that in Postgres.
 *
 * Two ways in:
 *   * `CRON_SECRET` as a bearer token, which Vercel Cron sends by itself when
 *     that variable is set.
 *   * the scheduler token in the database, generated there and never copied
 *     into an env var. This is what the 5-minute job uses.
 */
export const dynamic = "force-dynamic";

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function isAuthorized(bearer: string): Promise<boolean> {
  if (!bearer) return false;

  const secret = process.env.CRON_SECRET;
  if (secret && sameSecret(bearer, secret)) return true;

  if (!isTradingConfigured()) return false;

  const { data, error } = await createAdminClient().rpc("verify_cron_token", {
    p_token: bearer,
  });

  return !error && data === true;
}

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  // An open endpoint here would let anyone spend our market-data quota.
  if (!(await isAuthorized(bearer))) {
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

/** Vercel Cron sends GET; the database job posts. Same handler for both. */
export async function POST(request: Request) {
  return GET(request);
}
