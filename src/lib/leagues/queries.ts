import { getLivePrices } from "@/lib/market/prices";
import { getSolPriceUsd } from "@/lib/market/sol";
import { createClient } from "@/lib/supabase/server";

import type { AccountSummary } from "./active-account";

/**
 * League reads for the index page. These run through the user's own client so
 * RLS decides what is visible: your leagues, plus public leagues you could
 * join. Standings (which need other members' accounts) live in `standings.ts`
 * and go through the service role after an explicit membership check.
 */

export type LeagueStatus = "upcoming" | "live" | "ended";

export type LeagueSummary = {
  id: string;
  name: string;
  status: LeagueStatus;
  visibility: "private" | "public";
  startingBalance: number;
  startsAt: string;
  endsAt: string;
  maxPlayers: number;
  members: number;
  inviteCode: string;
  isCreator: boolean;
  joined: boolean;
  /** Your league account, marked to market. Null when you're not in it. */
  myEquitySol: number | null;
  myPnlPct: number | null;
};

type LeagueRow = {
  id: string;
  name: string;
  visibility: "private" | "public";
  starting_balance: string | number;
  starts_at: string;
  ends_at: string;
  max_players: number;
  invite_code: string;
  created_by: string;
};

type MembershipRow = {
  league_id: string;
  leagues: LeagueRow | LeagueRow[] | null;
};

type PositionRow = {
  account_id: string;
  token_mint: string;
  token_amount: string | number;
};

/** Status is derived from the clock, never trusted from the stored column. */
export function leagueStatus(startsAt: string, endsAt: string): LeagueStatus {
  const now = Date.now();
  if (Date.parse(endsAt) <= now) return "ended";
  if (Date.parse(startsAt) > now) return "upcoming";
  return "live";
}

function sumMembers(
  rows: Array<{ league_id: string }> | null | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    counts.set(row.league_id, (counts.get(row.league_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Your equity in a set of leagues. One positions query and one batched price
 * request covers every league account you own, so this stays cheap no matter
 * how many leagues you're in.
 */
async function myLeagueEquity(
  accounts: AccountSummary[],
  leagueIds: string[],
): Promise<Map<string, { equitySol: number; pnlPct: number }>> {
  const result = new Map<string, { equitySol: number; pnlPct: number }>();

  const mine = accounts.filter(
    (account) =>
      account.type === "league" &&
      account.leagueId !== null &&
      leagueIds.includes(account.leagueId),
  );

  if (mine.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("positions")
    .select("account_id, token_mint, token_amount")
    .in(
      "account_id",
      mine.map((account) => account.id),
    );

  const positions = (data ?? []) as PositionRow[];
  const [prices, solPrice] = await Promise.all([
    getLivePrices(positions.map((row) => row.token_mint)),
    getSolPriceUsd(),
  ]);

  const valueByAccount = new Map<string, number>();
  for (const position of positions) {
    const live = prices[position.token_mint]?.priceUsd;
    if (!live || !solPrice) continue;

    const valueSol = (Number(position.token_amount ?? 0) * live) / solPrice;
    valueByAccount.set(
      position.account_id,
      (valueByAccount.get(position.account_id) ?? 0) + valueSol,
    );
  }

  for (const account of mine) {
    const equitySol = account.solBalance + (valueByAccount.get(account.id) ?? 0);
    const starting = account.startingBalance || 1;

    result.set(account.leagueId as string, {
      equitySol,
      pnlPct: ((equitySol - starting) / starting) * 100,
    });
  }

  return result;
}

function toSummary({
  league,
  userId,
  members,
  joined,
  equity,
}: {
  league: LeagueRow;
  userId: string;
  members: number;
  joined: boolean;
  equity?: { equitySol: number; pnlPct: number };
}): LeagueSummary {
  return {
    id: league.id,
    name: league.name,
    status: leagueStatus(league.starts_at, league.ends_at),
    visibility: league.visibility,
    startingBalance: Number(league.starting_balance ?? 0),
    startsAt: league.starts_at,
    endsAt: league.ends_at,
    maxPlayers: league.max_players,
    members,
    inviteCode: league.invite_code,
    isCreator: league.created_by === userId,
    joined,
    myEquitySol: equity?.equitySol ?? null,
    myPnlPct: equity?.pnlPct ?? null,
  };
}

export async function getMyLeagues(
  userId: string,
  accounts: AccountSummary[],
): Promise<LeagueSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("league_members")
    .select(
      "league_id, leagues(id, name, visibility, starting_balance, starts_at, ends_at, max_players, invite_code, created_by)",
    )
    .eq("user_id", userId);

  const memberships = (data ?? []) as unknown as MembershipRow[];
  const leagues = memberships
    .map((row) =>
      Array.isArray(row.leagues) ? row.leagues[0] : row.leagues,
    )
    .filter((row): row is LeagueRow => Boolean(row));

  if (leagues.length === 0) return [];

  const leagueIds = leagues.map((league) => league.id);

  const [countRows, equity] = await Promise.all([
    supabase
      .from("league_members")
      .select("league_id")
      .in("league_id", leagueIds),
    myLeagueEquity(accounts, leagueIds),
  ]);

  const counts = sumMembers(
    (countRows.data ?? []) as Array<{ league_id: string }>,
  );

  return leagues
    .map((league) =>
      toSummary({
        league,
        userId,
        members: counts.get(league.id) ?? 0,
        joined: true,
        equity: equity.get(league.id),
      }),
    )
    .sort(
      (a, b) =>
        Number(a.status === "ended") - Number(b.status === "ended") ||
        Date.parse(b.startsAt) - Date.parse(a.startsAt),
    );
}

export async function getPublicLeagues(
  userId: string,
): Promise<LeagueSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("leagues")
    .select(
      "id, name, visibility, starting_balance, starts_at, ends_at, max_players, invite_code, created_by",
    )
    .eq("mode", "paper")
    .eq("visibility", "public")
    .gt("ends_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(12);

  const leagues = (data ?? []) as LeagueRow[];
  if (leagues.length === 0) return [];

  const leagueIds = leagues.map((league) => league.id);

  const [countRows, mineRows] = await Promise.all([
    supabase
      .from("league_members")
      .select("league_id")
      .in("league_id", leagueIds),
    supabase
      .from("league_members")
      .select("league_id")
      .in("league_id", leagueIds)
      .eq("user_id", userId),
  ]);

  const counts = sumMembers(
    (countRows.data ?? []) as Array<{ league_id: string }>,
  );
  const joined = new Set(
    ((mineRows.data ?? []) as Array<{ league_id: string }>).map(
      (row) => row.league_id,
    ),
  );

  // Anything you're already in shows under "My leagues" with real numbers, so
  // the public list only offers leagues you can still join.
  return leagues
    .filter((league) => !joined.has(league.id))
    .map((league) =>
      toSummary({
        league,
        userId,
        members: counts.get(league.id) ?? 0,
        joined: false,
      }),
    );
}
