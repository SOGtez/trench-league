"use server";

import { revalidatePath } from "next/cache";

import type { CallSide } from "@/lib/calls/types";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";

export type PickResult = { error: string | null };

const ERRORS: Record<string, string> = {
  invalid_pick: "Pick one of the two sides.",
  call_not_found: "That call has already closed.",
  call_locked: "Picks just locked for this call.",
  call_resolved: "That call has already been scored.",
  not_authenticated: "Sign in to make a call.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapError(message: string): string {
  const known = Object.keys(ERRORS).find((key) => message.includes(key));
  return known ? ERRORS[known] : "Couldn't save that pick. Try again.";
}

/**
 * Writes a pick through `place_call_pick`.
 *
 * The client passes a call and a side and nothing else: the lock time, the
 * scoring and the streak all live in the database function, so a stale button
 * or a replayed request cannot pick after the close.
 */
export async function pickSide(
  callId: string,
  pick: CallSide,
): Promise<PickResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: ERRORS.not_authenticated };

  if (!UUID.test(callId) || (pick !== "a" && pick !== "b")) {
    return { error: ERRORS.invalid_pick };
  }

  if (!isTradingConfigured()) {
    return { error: "Calls aren't configured on the server." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("place_call_pick", {
    p_user_id: ctx.user.id,
    p_call_id: callId,
    p_pick: pick,
  });

  if (error) return { error: mapError(error.message) };

  revalidatePath("/calls");
  return { error: null };
}
