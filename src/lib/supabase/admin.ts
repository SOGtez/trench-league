import { createClient } from "@supabase/supabase-js";

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

/**
 * Service-role client — bypasses RLS, so it must only ever run on the server
 * inside trusted code (trading engine, settlement, cron). Never pass it to a
 * client component and never call it with user-supplied authorisation.
 */
export function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — paper trading is disabled.",
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
