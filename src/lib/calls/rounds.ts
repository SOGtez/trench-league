import { getDiscoverSnapshot } from "@/lib/market/discover";
import type { MarketToken } from "@/lib/market/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";

import { CALL_LOCK_MINUTES, CALL_ROUND_MINUTES } from "./types";

/**
 * Round generation.
 *
 * A round is two calls (one up/down, one head-to-head) with a shared window,
 * created lazily: whoever asks first — the Calls page or the cron route —
 * creates the round if it is missing, and the unique index on
 * `(round_id, kind)` means a race just loses instead of double-creating.
 *
 * Tokens are chosen from the live Discover board, and their opening prices are
 * taken from the same snapshot, so a call and its reference price can never
 * disagree.
 */

const SLOT_MS = CALL_ROUND_MINUTES * 60_000;
const LOCK_MS = CALL_LOCK_MINUTES * 60_000;

/** Only coins with real depth get a call — thin pools make a coin-flip. */
const MIN_LIQUIDITY_USD = 50_000;

type RoundCallRow = {
  round_id: string;
  kind: "updown" | "h2h";
  question: string;
  option_a: string;
  option_b: string;
  locks_at: string;
  resolves_at: string;
  token_mint: string;
  token_symbol: string;
  token_pool: string | null;
  price_open: number;
  rival_mint?: string;
  rival_symbol?: string;
  rival_pool?: string | null;
  rival_price_open?: number;
};

/** The slot a new round should be created for: now, or the next one if this
 * one is about to lock (so there is always something pickable). */
export function roundSlot(nowMs = Date.now()): number {
  const slot = Math.floor(nowMs / SLOT_MS) * SLOT_MS;
  return nowMs >= slot + LOCK_MS - 60_000 ? slot + SLOT_MS : slot;
}

function hasPrice(token: MarketToken): boolean {
  return Boolean(token.priceUsd && token.priceUsd > 0 && token.poolAddress);
}

function liquid(tokens: MarketToken[]): MarketToken[] {
  return tokens.filter(
    (token) => hasPrice(token) && (token.liquidityUsd ?? 0) >= MIN_LIQUIDITY_USD,
  );
}

/**
 * Prefer graduated, liquid coins: a memecoin on the bonding curve can move
 * 40% in a minute, which turns a call into noise rather than a read on flow.
 */
function candidates(snapshot: Awaited<ReturnType<typeof getDiscoverSnapshot>>) {
  const { trending, graduating, launches } = snapshot.columns;

  const ordered = [
    ...liquid(trending),
    ...liquid(graduating),
    ...liquid(launches),
    ...trending.filter(hasPrice),
    ...graduating.filter(hasPrice),
    ...launches.filter(hasPrice),
  ];

  const seen = new Set<string>();
  return ordered.filter((token) => {
    if (seen.has(token.mint)) return false;
    seen.add(token.mint);
    return true;
  });
}

function buildRoundRows(
  roundId: string,
  tokens: MarketToken[],
): RoundCallRow[] | null {
  const [head, ...rest] = tokens;
  if (!head || head.priceUsd === null) return null;

  const rival = rest.find((token) => token.mint !== head.mint);
  if (!rival || rival.priceUsd === null) return null;

  const start = Date.parse(roundId);
  const locksAt = new Date(start + LOCK_MS).toISOString();
  const resolvesAt = new Date(start + SLOT_MS).toISOString();

  return [
    {
      round_id: roundId,
      kind: "updown",
      question: `Will $${head.symbol} close higher in ${CALL_ROUND_MINUTES} minutes?`,
      option_a: "Higher",
      option_b: "Lower",
      locks_at: locksAt,
      resolves_at: resolvesAt,
      token_mint: head.mint,
      token_symbol: head.symbol,
      token_pool: head.poolAddress ?? null,
      price_open: head.priceUsd,
    },
    {
      round_id: roundId,
      kind: "h2h",
      question: `Which closes higher in ${CALL_ROUND_MINUTES} minutes?`,
      option_a: `$${head.symbol}`,
      option_b: `$${rival.symbol}`,
      locks_at: locksAt,
      resolves_at: resolvesAt,
      token_mint: head.mint,
      token_symbol: head.symbol,
      token_pool: head.poolAddress ?? null,
      price_open: head.priceUsd,
      rival_mint: rival.mint,
      rival_symbol: rival.symbol,
      rival_pool: rival.poolAddress ?? null,
      rival_price_open: rival.priceUsd,
    },
  ];
}

/**
 * Creates the current round when it does not exist yet. Returns the round id
 * that is open now (whether or not this call created it).
 */
export async function ensureOpenRound(nowMs = Date.now()): Promise<string | null> {
  if (!isTradingConfigured()) return null;

  const admin = createAdminClient();

  // Fast path: something is already pickable, so nobody needs the board.
  const { data: open } = await admin
    .from("calls")
    .select("id, round_id")
    .is("result", null)
    .gt("locks_at", new Date(nowMs + 60_000).toISOString())
    .order("locks_at", { ascending: false })
    .limit(1);

  if (open && open.length > 0) {
    return (open[0] as { round_id: string | null }).round_id;
  }

  const roundId = new Date(roundSlot(nowMs)).toISOString();

  const { data: existing } = await admin
    .from("calls")
    .select("id")
    .eq("round_id", roundId)
    .limit(1);

  if (existing && existing.length > 0) return roundId;

  const snapshot = await getDiscoverSnapshot();
  const rows = buildRoundRows(roundId, candidates(snapshot));
  if (!rows) return null;

  // A duplicate here means another request created the same round first, which
  // is exactly what the unique index is for.
  const { error } = await admin.from("calls").insert(rows);
  if (error && error.code !== "23505" && error.code !== "42P10") {
    throw new Error(`Could not create round: ${error.message}`);
  }

  return roundId;
}
