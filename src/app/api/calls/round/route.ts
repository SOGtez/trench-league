import { getAuthContext } from "@/lib/auth";
import { getCallsView } from "@/lib/calls/queries";
import { syncCalls } from "@/lib/calls/settle";
import { isTradingConfigured } from "@/lib/supabase/env";

/**
 * What the Calls board polls every 5 seconds.
 *
 * It also does the housekeeping — score rounds that have closed, open the next
 * one — because there is no guarantee a cron job is configured on this
 * deployment. Both operations are idempotent, so many tabs polling at once just
 * means the work happens once and the rest read a settled state.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return Response.json({ error: "Sign in to see calls." }, { status: 401 });
  }

  if (!isTradingConfigured()) {
    return Response.json(
      { error: "Calls aren't configured on the server." },
      { status: 503 },
    );
  }

  await syncCalls();

  const view = await getCallsView(ctx.user.id);

  return Response.json(view, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
