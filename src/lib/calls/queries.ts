import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import {
  byKind,
  type CallKind,
  type CallLeg,
  type CallSide,
  type CallState,
  type CallStats,
  type CallView,
  type CallsView,
} from "./types";

/**
 * Reads for the Calls page and its polling route.
 *
 * Calls are readable by everyone signed in, picks only by their owner, so the
 * view is assembled from the user's own client and the crowd split (which needs
 * everyone's picks) comes from one aggregate RPC through the service role.
 */

const HISTORY_LIMIT = 12;

type CallRow = {
  id: string;
  kind: CallKind;
  round_id: string | null;
  question: string;
  option_a: string;
  option_b: string;
  locks_at: string;
  resolves_at: string;
  result: CallSide | null;
  token_mint: string | null;
  token_symbol: string | null;
  price_open: string | number | null;
  rival_mint: string | null;
  rival_symbol: string | null;
  rival_price_open: string | number | null;
  price_close: string | number | null;
  rival_price_close: string | number | null;
};

type PickRow = {
  call_id: string;
  pick: CallSide;
  points: number | null;
  correct: boolean | null;
};

type ProfileRow = {
  points_total: number | null;
  streak_current: number | null;
  streak_best: number | null;
  calls_scored: number | null;
  calls_correct: number | null;
};

const SELECT =
  "id, kind, round_id, question, option_a, option_b, locks_at, resolves_at, result, " +
  "token_mint, token_symbol, price_open, rival_mint, rival_symbol, rival_price_open, " +
  "price_close, rival_price_close";

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function changePct(open: number | null, close: number | null): number | null {
  if (open === null || close === null || open === 0) return null;
  return ((close - open) / open) * 100;
}

function legsOf(row: CallRow): CallLeg[] {
  if (!row.token_mint) return [];

  const head: CallLeg = {
    mint: row.token_mint,
    symbol: row.token_symbol ?? row.token_mint.slice(0, 4),
    priceOpen: toNumber(row.price_open),
    priceClose: toNumber(row.price_close),
    changePct: changePct(toNumber(row.price_open), toNumber(row.price_close)),
  };

  if (row.kind !== "h2h" || !row.rival_mint) return [head];

  return [
    head,
    {
      mint: row.rival_mint,
      symbol: row.rival_symbol ?? row.rival_mint.slice(0, 4),
      priceOpen: toNumber(row.rival_price_open),
      priceClose: toNumber(row.rival_price_close),
      changePct: changePct(
        toNumber(row.rival_price_open),
        toNumber(row.rival_price_close),
      ),
    },
  ];
}

function stateOf(row: CallRow, nowMs: number): CallState {
  if (row.result) return "resolved";
  return Date.parse(row.locks_at) <= nowMs ? "locked" : "open";
}

/** Crowd split for calls whose picks are already closed. */
async function talliesFor(
  callIds: string[],
): Promise<Map<string, { a: number; b: number }>> {
  const result = new Map<string, { a: number; b: number }>();
  if (callIds.length === 0 || !isTradingConfigured()) return result;

  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("call_tallies", { p_call_ids: callIds });

    for (const row of (data ?? []) as Array<{
      call_id: string;
      side_a: number;
      side_b: number;
    }>) {
      result.set(row.call_id, { a: Number(row.side_a), b: Number(row.side_b) });
    }
  } catch {
    // A missing split only hides the bar.
  }

  return result;
}

function buildView({
  row,
  pick,
  tally,
  nowMs,
}: {
  row: CallRow;
  pick: PickRow | undefined;
  tally: { a: number; b: number } | undefined;
  nowMs: number;
}): CallView {
  return {
    id: row.id,
    kind: row.kind,
    roundId: row.round_id,
    question: row.question,
    optionA: row.option_a,
    optionB: row.option_b,
    legs: legsOf(row),
    locksAt: row.locks_at,
    resolvesAt: row.resolves_at,
    state: stateOf(row, nowMs),
    result: row.result,
    tally: tally ?? null,
    myPick: pick?.pick ?? null,
    myPoints: pick?.points ?? null,
    myCorrect: pick?.correct ?? null,
  };
}

function statsFrom(profile: ProfileRow | null): CallStats {
  const scored = Number(profile?.calls_scored ?? 0);
  const correct = Number(profile?.calls_correct ?? 0);

  return {
    points: Number(profile?.points_total ?? 0),
    streak: Number(profile?.streak_current ?? 0),
    bestStreak: Number(profile?.streak_best ?? 0),
    scored,
    correct,
    accuracyPct: scored > 0 ? (correct / scored) * 100 : null,
  };
}

export async function getCallsView(
  userId: string,
  nowMs = Date.now(),
): Promise<CallsView> {
  const nowIso = new Date(nowMs).toISOString();
  const supabase = await createClient();

  const [activeResult, recentResult, profileResult] = await Promise.all([
    supabase
      .from("calls")
      .select(SELECT)
      .is("result", null)
      .gt("resolves_at", new Date(nowMs - 10 * 60_000).toISOString())
      .order("locks_at", { ascending: false })
      .limit(6),
    supabase
      .from("calls")
      .select(SELECT)
      .not("result", "is", null)
      .order("resolves_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("profiles")
      .select("points_total, streak_current, streak_best, calls_scored, calls_correct")
      .eq("id", userId)
      .maybeSingle<ProfileRow>(),
  ]);

  const activeRows = (activeResult.data ?? []) as unknown as CallRow[];
  const recentRows = (recentResult.data ?? []) as unknown as CallRow[];
  const rows = [...activeRows, ...recentRows];

  const ids = rows.map((row) => row.id);
  const pickResult = ids.length
    ? await supabase
        .from("call_picks")
        .select("call_id, pick, points, correct")
        .eq("user_id", userId)
        .in("call_id", ids)
    : { data: [] as PickRow[] };

  const picks = new Map(
    ((pickResult.data ?? []) as PickRow[]).map((row) => [row.call_id, row]),
  );

  const lockedIds = rows
    .filter((row) => Date.parse(row.locks_at) <= nowMs)
    .map((row) => row.id);
  const tallies = await talliesFor(lockedIds);

  // Several rounds can be unresolved at once (the next one opens while the
  // last one is still closing), but "This round" is only ever one of them: the
  // newest, i.e. the one you can still act on.
  const focusRoundId =
    activeRows.length > 0
      ? activeRows.reduce((latest, row) =>
          Date.parse(row.locks_at) > Date.parse(latest.locks_at) ? row : latest,
        ).round_id
      : null;

  const toView = (row: CallRow) =>
    buildView({ row, pick: picks.get(row.id), tally: tallies.get(row.id), nowMs });

  const active = activeRows
    .filter((row) => row.round_id === focusRoundId)
    .map(toView)
    .sort(byKind);

  const pending = activeRows
    .filter((row) => row.round_id !== focusRoundId)
    .map(toView)
    .sort((a, b) => Date.parse(b.resolvesAt) - Date.parse(a.resolvesAt));

  const recent = recentRows.map(toView);

  return {
    generatedAt: nowIso,
    roundId: focusRoundId,
    roundEndsAt: active.length > 0 ? active[0].resolvesAt : null,
    active,
    pending,
    recent,
    stats: statsFrom(profileResult.data ?? null),
  };
}
