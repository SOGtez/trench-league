import { fetchCandles } from "@/lib/market/geckoterminal";
import { getLivePrices } from "@/lib/market/prices";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";

import { ensureOpenRound } from "./rounds";
import type { CallSide } from "./types";

/**
 * Settlement.
 *
 * Prices only exist in TypeScript (Postgres cannot see the market), so the
 * outcome is decided here and handed to `resolve_call`, which does the scoring
 * transactionally. A second run for the same call is a no-op.
 *
 * Closing prices come from 1-minute candles on the pool, taking the candle that
 * covers the resolve time — that is the actual close, even if settlement runs
 * late or is retried an hour afterwards. When candles are unavailable the live
 * pool price is used as a fallback.
 */

/** Calls settled per run — keeps one slow upstream from stalling the page. */
const BATCH = 6;
const CANDLE_LIMIT = 60;

type PendingCall = {
  id: string;
  kind: "updown" | "h2h";
  resolves_at: string;
  token_mint: string;
  token_pool: string | null;
  price_open: string | number | null;
  rival_mint: string | null;
  rival_pool: string | null;
  rival_price_open: string | number | null;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Price of a token at (or just before) a moment in time. */
async function priceAt(
  pool: string | null,
  mint: string,
  atMs: number,
): Promise<number | null> {
  if (pool) {
    const candles = await fetchCandles(pool, "minute", 1, CANDLE_LIMIT);

    if (candles && candles.length > 0) {
      let covering = candles[0];
      for (const candle of candles) {
        // Candle timestamps are the candle's opening second.
        if (candle.time * 1000 <= atMs) covering = candle;
      }
      if (covering.close > 0) return covering.close;
    }
  }

  // No pool or no candles: the live price is close enough, and a wrong-by-a-
  // -minute price still resolves to the same side in almost every case.
  try {
    const live = await getLivePrices([mint]);
    return live[mint]?.priceUsd ?? null;
  } catch {
    return null;
  }
}

function decide(
  call: PendingCall,
  openA: number | null,
  openB: number | null,
  closeA: number | null,
  closeB: number | null,
): { result: CallSide | null; closeA: number | null; closeB: number | null } {
  if (openA === null || closeA === null) {
    return { result: null, closeA: null, closeB: null };
  }

  if (call.kind === "updown") {
    // Flat is not a win for either side, so a dead-flat close pays nobody.
    if (closeA === openA) return { result: null, closeA, closeB: null };
    return { result: closeA > openA ? "a" : "b", closeA, closeB: null };
  }

  if (openB === null || closeB === null) {
    return { result: null, closeA: null, closeB: null };
  }

  const changeA = (closeA - openA) / openA;
  const changeB = (closeB - openB) / openB;
  if (changeA === changeB) return { result: null, closeA, closeB };

  return { result: changeA > changeB ? "a" : "b", closeA, closeB };
}

async function settleOne(
  admin: ReturnType<typeof createAdminClient>,
  call: PendingCall,
): Promise<boolean> {
  const resolveMs = Date.parse(call.resolves_at);
  const openA = toNumber(call.price_open);
  const openB = toNumber(call.rival_price_open);

  const [closeA, closeB] = await Promise.all([
    priceAt(call.token_pool, call.token_mint, resolveMs),
    call.kind === "h2h" && call.rival_mint
      ? priceAt(call.rival_pool, call.rival_mint, resolveMs)
      : Promise.resolve(null),
  ]);

  const { result } = decide(call, openA, openB, closeA, closeB);
  if (!result) return false;

  const { error } = await admin.rpc("resolve_call", {
    p_call_id: call.id,
    p_result: result,
    p_price_close: closeA,
    p_rival_price_close: closeB,
  });

  return !error;
}

/** Scores every call whose window has closed. Returns how many were settled. */
export async function settleDueCalls(nowMs = Date.now()): Promise<number> {
  if (!isTradingConfigured()) return 0;

  const admin = createAdminClient();

  const { data } = await admin
    .from("calls")
    .select(
      "id, kind, resolves_at, token_mint, token_pool, price_open, rival_mint, rival_pool, rival_price_open",
    )
    .is("result", null)
    .lte("resolves_at", new Date(nowMs).toISOString())
    .order("resolves_at", { ascending: true })
    .limit(BATCH);

  const pending = (data ?? []) as PendingCall[];
  if (pending.length === 0) return 0;

  // Each call settles independently: one dead pool must not block the others.
  const outcomes = await Promise.all(
    pending.map(async (call) => {
      try {
        return await settleOne(admin, call);
      } catch {
        return false;
      }
    }),
  );

  return outcomes.filter(Boolean).length;
}

/**
 * Brings the calls world up to date for whoever asked: score what has closed,
 * then make sure the next round exists. Never throws — a bad market read must
 * not take the page down with it.
 */
export async function syncCalls(nowMs = Date.now()): Promise<void> {
  if (!isTradingConfigured()) return;

  try {
    await settleDueCalls(nowMs);
  } catch {
    // Retried on the next poll.
  }

  try {
    await ensureOpenRound(nowMs);
  } catch {
    // Same: the next tick tries again.
  }
}
