"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_ACCOUNT_COOKIE,
  listAccounts,
} from "@/lib/leagues/active-account";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LeagueFormState = { error: string | null };
export type SwitchState = { error: string | null };

const CREATE_ERRORS: Record<string, string> = {
  invalid_name: "Give the league a name between 1 and 60 characters.",
  invalid_balance: "Starting balance must be between 1 and 1,000 SOL.",
  invalid_duration: "Pick a duration between 1 and 90 days.",
  invalid_max_players: "Players must be between 2 and 100.",
  invalid_visibility: "Pick private or public.",
};

const JOIN_ERRORS: Record<string, string> = {
  invalid_code: "Enter the invite code from the league.",
  league_not_found: "No league has that invite code.",
  league_ended: "That league has already ended.",
  already_member: "You're already in that league.",
  league_full: "That league is full.",
};

function mapError(
  message: string,
  table: Record<string, string>,
  fallback: string,
): string {
  const known = Object.keys(table).find((key) => message.includes(key));
  return known ? table[known] : fallback;
}

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Points the terminal at one of *this user's* accounts. */
async function activate(accountId: string | null | undefined) {
  if (!accountId) return;

  const store = await cookies();
  store.set(ACTIVE_ACCOUNT_COOKIE, accountId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
  });
}

async function accountForLeague(leagueId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("league_members")
    .select("account_id")
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .maybeSingle<{ account_id: string | null }>();

  return data?.account_id ?? null;
}

export async function createLeague(
  _previous: LeagueFormState,
  formData: FormData,
): Promise<LeagueFormState> {
  if (!isTradingConfigured()) {
    return { error: "Leagues need the server credentials — missing service role key." };
  }

  const user = await currentUser();
  if (!user) return { error: "Your session expired. Log in again." };

  const name = String(formData.get("name") ?? "").trim();
  const startingBalance = Number(formData.get("startingBalance") ?? 0);
  const durationDays = Number(formData.get("durationDays") ?? 0);
  const maxPlayers = Number(formData.get("maxPlayers") ?? 0);
  const visibility = String(formData.get("visibility") ?? "private");

  if (name.length < 1 || name.length > 60) {
    return { error: "Give the league a name between 1 and 60 characters." };
  }
  if (!Number.isFinite(startingBalance) || startingBalance < 1 || startingBalance > 1000) {
    return { error: "Starting balance must be between 1 and 1,000 SOL." };
  }
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 90) {
    return { error: "Pick a duration between 1 and 90 days." };
  }
  if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 100) {
    return { error: "Players must be between 2 and 100." };
  }
  if (visibility !== "private" && visibility !== "public") {
    return { error: "Pick private or public." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_paper_league", {
    p_user_id: user.id,
    p_name: name,
    p_starting_balance: startingBalance,
    p_duration_days: durationDays,
    p_max_players: maxPlayers,
    p_visibility: visibility,
  });

  if (error) {
    return {
      error: mapError(error.message, CREATE_ERRORS, "Couldn't create that league."),
    };
  }

  const created = (data ?? []) as Array<{ out_league_id: string }>;
  const leagueId = created[0]?.out_league_id;

  if (!leagueId) return { error: "Couldn't create that league." };

  // You just made it — start playing it.
  await activate(await accountForLeague(leagueId, user.id));

  revalidatePath("/leagues");
  redirect(`/leagues/${leagueId}`);
}

export async function joinLeague(
  _previous: LeagueFormState,
  formData: FormData,
): Promise<LeagueFormState> {
  if (!isTradingConfigured()) {
    return { error: "Leagues need the server credentials — missing service role key." };
  }

  const user = await currentUser();
  if (!user) return { error: "Your session expired. Log in again." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (code.length < 4) {
    return { error: "Enter the invite code from the league." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("join_paper_league", {
    p_user_id: user.id,
    p_invite_code: code,
  });

  if (error) {
    return {
      error: mapError(error.message, JOIN_ERRORS, "Couldn't join that league."),
    };
  }

  const leagueId = data as string | null;
  if (!leagueId) return { error: "Couldn't join that league." };

  await activate(await accountForLeague(leagueId, user.id));

  revalidatePath("/leagues");
  redirect(`/leagues/${leagueId}`);
}

/**
 * Switching accounts only changes which context you're trading in. The
 * ownership check is the point: the cookie is a hint, the database is the
 * authority.
 */
export async function switchAccount(accountId: string): Promise<SwitchState> {
  const user = await currentUser();
  if (!user) return { error: "Your session expired. Log in again." };

  const accounts = await listAccounts(user.id);
  const account = accounts.find((entry) => entry.id === accountId);

  if (!account) return { error: "That account isn't yours." };

  await activate(account.id);
  revalidatePath("/", "layout");

  return { error: null };
}

/** League page CTA: switch into the league account and go find a coin. */
export async function tradeInLeague(
  _previous: SwitchState,
  formData: FormData,
): Promise<SwitchState> {
  const accountId = String(formData.get("accountId") ?? "");

  const result = await switchAccount(accountId);
  if (result.error) return result;

  redirect("/discover");
}
