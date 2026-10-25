export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Server-only. Never referenced from a client component or bundled for the browser. */
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Until the Supabase project is connected the app renders a setup notice
 * instead of failing on every request. Everything auth-related is guarded by
 * this check.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Trading writes need the service role; without it the engine stays read-only. */
export function isTradingConfigured(): boolean {
  return isSupabaseConfigured() && SUPABASE_SERVICE_ROLE_KEY.length > 0;
}
