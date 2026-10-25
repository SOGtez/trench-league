import { getAuthContext } from "@/lib/auth";
import { getLeagueStandings } from "@/lib/leagues/standings";
import { isTradingConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * What the league page polls every 15 seconds. Membership is checked here with
 * the caller's own client first — the service role only runs the aggregate
 * after that check passes, and the response carries nothing but the board.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const ctx = await getAuthContext();
  if (!ctx) {
    return Response.json({ error: "Sign in to see standings." }, { status: 401 });
  }

  if (!isTradingConfigured()) {
    return Response.json(
      { error: "Standings aren't configured on the server." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues")
    .select("id, visibility, starts_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      visibility: "private" | "public";
      starts_at: string;
    }>();

  if (!league) {
    return Response.json({ error: "League not found." }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("league_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle<{ league_id: string }>();

  if (!membership && league.visibility !== "public") {
    return Response.json({ error: "Not a member of this league." }, { status: 403 });
  }

  try {
    const snapshot = await getLeagueStandings({
      leagueId: id,
      startsAt: league.starts_at,
      currentUserId: ctx.user.id,
    });

    return Response.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Couldn't compute standings." },
      { status: 500 },
    );
  }
}
