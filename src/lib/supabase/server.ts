import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Server-side Supabase client. Uses the request's cookies so RLS runs as the
 * signed-in user. Never use this for trusted writes (trades, balances) — those
 * go through service-role code paths in later phases.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only. The proxy
          // already refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
