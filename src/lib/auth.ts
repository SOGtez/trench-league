import type { User } from "@supabase/supabase-js";

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
  practice: PracticeAccount | null;
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

  const [profileResult, practiceResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle<Profile>(),
    supabase
      .from("accounts")
      .select("id, sol_balance, starting_balance")
      .eq("user_id", user.id)
      .eq("type", "practice")
      .maybeSingle<{ id: string; sol_balance: number | string; starting_balance: number | string }>(),
  ]);

  const practice = practiceResult.data
    ? {
        id: practiceResult.data.id,
        sol_balance: Number(practiceResult.data.sol_balance ?? 0),
        starting_balance: Number(practiceResult.data.starting_balance ?? 0),
      }
    : null;

  return {
    user,
    profile: profileResult.data ?? null,
    practice,
  };
}

export function displayName(ctx: AuthContext): string {
  return ctx.profile?.username ?? ctx.user.email?.split("@")[0] ?? "trader";
}
