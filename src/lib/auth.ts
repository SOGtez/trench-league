import type { User } from "@supabase/supabase-js";

import {
  listAccounts,
  resolveActiveAccount,
  type AccountSummary,
} from "@/lib/leagues/active-account";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type PracticeAccount = {
  id: string;
  sol_balance: number;
  starting_balance: number;
};

export type AuthContext = {
  user: User;
  profile: Profile | null;
  /** The original practice account, kept for code that only knows practice. */
  practice: PracticeAccount | null;
  /** Practice plus one account per league, in switch order. */
  accounts: AccountSummary[];
  /** The account the terminal is pointed at right now. */
  active: AccountSummary | null;
};

/**
 * The single server-side auth lookup used by layouts and pages. Returns null
 * when signed out (or when Supabase isn't configured yet).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileResult, accounts] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle<Profile>(),
    listAccounts(user.id),
  ]);

  const active = await resolveActiveAccount(user.id, accounts);
  const practiceAccount =
    accounts.find((account) => account.type === "practice") ?? null;

  const practice: PracticeAccount | null = practiceAccount
    ? {
        id: practiceAccount.id,
        sol_balance: practiceAccount.solBalance,
        starting_balance: practiceAccount.startingBalance,
      }
    : null;

  return {
    user,
    profile: profileResult.data ?? null,
    practice,
    accounts,
    active,
  };
}

export function displayName(ctx: AuthContext): string {
  return ctx.profile?.username ?? ctx.user.email?.split("@")[0] ?? "trader";
}
