import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * Trading accounts belong to a context: one practice account, plus one
 * throwaway account per league you join. "Active" is which one the terminal is
 * pointed at right now — it lives in a cookie, but the cookie is only ever a
 * *hint*: every read re-checks that the account is actually owned by the
 * signed-in user, so editing the cookie can't trade somebody else's money.
 */
export const ACTIVE_ACCOUNT_COOKIE = "tl_account";

export type AccountSummary = {
  id: string;
  type: "practice" | "league";
  /** What the UI calls this account: "Practice" or the league's name. */
  label: string;
  solBalance: number;
  startingBalance: number;
  leagueId: string | null;
};

type AccountRow = {
  id: string;
  type: "practice" | "league";
  sol_balance: string | number;
  starting_balance: string | number;
  league_id: string | null;
  leagues:
    | { name: string }
    | { name: string }[]
    | null;
};

function leagueName(embedded: AccountRow["leagues"]): string | null {
  if (!embedded) return null;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return row?.name ?? null;
}

/** Practice first, then leagues alphabetically. */
export async function listAccounts(userId: string): Promise<AccountSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select(
      "id, type, sol_balance, starting_balance, league_id, leagues(name)",
    )
    .eq("user_id", userId);

  if (error || !data) return [];

  return (data as unknown as AccountRow[])
    .map((row) => ({
      id: row.id,
      type: row.type,
      label:
        row.type === "practice"
          ? "Practice"
          : (leagueName(row.leagues) ?? "League"),
      solBalance: Number(row.sol_balance ?? 0),
      startingBalance: Number(row.starting_balance ?? 0),
      leagueId: row.league_id,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "practice" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

/**
 * The account the terminal should trade and display. Falls back to the practice
 * account when the cookie is missing, stale, or points at an account that is no
 * longer owned by this user.
 */
export async function resolveActiveAccount(
  userId: string,
  accounts?: AccountSummary[],
): Promise<AccountSummary | null> {
  const [list, cookieStore] = await Promise.all([
    accounts ? Promise.resolve(accounts) : listAccounts(userId),
    cookies(),
  ]);

  if (list.length === 0) return null;

  const wanted = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;

  return (
    list.find((account) => account.id === wanted) ??
    list.find((account) => account.type === "practice") ??
    list[0]
  );
}

export function accountLabel(account: AccountSummary | null): string {
  if (!account) return "No account";
  return account.type === "practice" ? "Practice" : account.label;
}
