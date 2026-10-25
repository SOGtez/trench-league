import { getLivePrices } from "@/lib/market/prices";
import { getSolPriceUsd } from "@/lib/market/sol";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * League standings are computed server-side on every read: cash comes from the
 * database, positions are marked to the live pool price, and everybody is
 * ranked by % gain so a 5 SOL league and a 100 SOL league score the same.
 *
 * This needs the service role because RLS only lets a user read their *own*
 * account. The callers (league page, leaderboard route) check membership and
 * visibility first, and only the fields below ever leave the server.
 */

export type Standing = {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  accountId: string;
  /** Cash in paper SOL. */
  cashSol: number;
  /** Open positions marked to the live price. */
  positionsSol: number;
  equitySol: number;
  startingSol: number;
  pnlSol: number;
  pnlPct: number;
  trades: number;
  openPositions: number;
  /** Joined long after the league started, so their % gain is worth less. */
  lateJoin: boolean;
  isYou: boolean;
};

export type StandingsSnapshot = {
  generatedAt: string;
  solPriceUsd: number | null;
  /** False when the price feed failed — position values are then missing. */
  priced: boolean;
  standings: Standing[];
};

type BaseRow = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  account_id: string | null;
  sol_balance: string | number;
  starting_balance: string | number;
  trade_count: string | number;
  open_positions: string | number;
  joined_at: string;
};

type PositionRow = {
  account_id: string;
  token_mint: string;
  token_amount: string | number;
};

const LATE_JOIN_MS = 60 * 60 * 1000;

export async function getLeagueStandings({
  leagueId,
  startsAt,
  currentUserId,
}: {
  leagueId: string;
  startsAt: string;
  currentUserId?: string;
}): Promise<StandingsSnapshot> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("league_standings_base", {
    p_league_id: leagueId,
  });

  if (error) {
    throw new Error(`league_standings_base failed: ${error.message}`);
  }

  const base = (data ?? []) as BaseRow[];
  const accountIds = base
    .map((row) => row.account_id)
    .filter((id): id is string => Boolean(id));

  const { data: positionData } = accountIds.length
    ? await admin
        .from("positions")
        .select("account_id, token_mint, token_amount")
        .in("account_id", accountIds)
    : { data: [] as PositionRow[] };

  const positions = (positionData ?? []) as PositionRow[];

  const [prices, solPrice] = await Promise.all([
    getLivePrices(positions.map((row) => row.token_mint)),
    getSolPriceUsd(),
  ]);

  const positionValueByAccount = new Map<string, number>();
  for (const position of positions) {
    const live = prices[position.token_mint]?.priceUsd ?? null;
    const tokens = Number(position.token_amount ?? 0);
    if (!live || !solPrice) continue;

    const valueSol = (tokens * live) / solPrice;
    positionValueByAccount.set(
      position.account_id,
      (positionValueByAccount.get(position.account_id) ?? 0) + valueSol,
    );
  }

  const startsMs = Date.parse(startsAt);

  const rows: Omit<Standing, "rank">[] = base.map((row) => {
    const cashSol = Number(row.sol_balance ?? 0);
    const startingSol = Number(row.starting_balance ?? 0) || 1;
    const positionsSol = row.account_id
      ? (positionValueByAccount.get(row.account_id) ?? 0)
      : 0;
    const equitySol = cashSol + positionsSol;
    const pnlSol = equitySol - startingSol;

    return {
      userId: row.user_id,
      username: row.username ?? "anon",
      avatarUrl: row.avatar_url,
      accountId: row.account_id ?? "",
      cashSol,
      positionsSol,
      equitySol,
      startingSol,
      pnlSol,
      pnlPct: (pnlSol / startingSol) * 100,
      trades: Number(row.trade_count ?? 0),
      openPositions: Number(row.open_positions ?? 0),
      lateJoin:
        Number.isFinite(startsMs) &&
        Date.parse(row.joined_at) - startsMs > LATE_JOIN_MS,
      isYou: row.user_id === currentUserId,
    };
  });

  rows.sort(
    (a, b) => b.pnlPct - a.pnlPct || b.equitySol - a.equitySol,
  );

  return {
    generatedAt: new Date().toISOString(),
    solPriceUsd: solPrice,
    // If the feed misses a position its value is silently 0, which would make
    // the whole board look flat. Flag it so the UI can say so.
    priced:
      Boolean(solPrice) &&
      positions.every((row) => Boolean(prices[row.token_mint]?.priceUsd)),
    standings: rows.map((row, index) => ({ ...row, rank: index + 1 })),
  };
}
