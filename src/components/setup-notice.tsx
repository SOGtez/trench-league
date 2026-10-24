/**
 * Shown app-wide until the Supabase project is connected. Keeps the app
 * navigable during setup instead of erroring on every page.
 */
export function SetupNotice() {
  return (
    <div className="border-b border-gold/30 bg-gold/10">
      <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center gap-x-2 gap-y-1 px-6 py-2.5 text-[13px]">
        <span className="font-bold text-gold">Supabase not connected.</span>
        <span className="text-soft">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
          .env.local, then run supabase/migrations/0001_init.sql in the SQL
          editor. See the README.
        </span>
      </div>
    </div>
  );
}
