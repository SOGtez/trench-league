import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { NavLinks } from "@/components/nav-links";
import { Wordmark } from "@/components/logo";
import { displayName, type AuthContext } from "@/lib/auth";
import { cn, formatSol, initials } from "@/lib/utils";

export function AppHeader({ ctx }: { ctx: AuthContext | null }) {
  const name = ctx ? displayName(ctx) : "guest";
  const account = ctx?.active ?? null;
  const balance = account?.solBalance ?? 0;
  const inLeague = account?.type === "league";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-header/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Wordmark className="shrink-0" compact />

        <nav className="hidden md:block" aria-label="Main">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/portfolio"
            title={
              inLeague
                ? `League account: ${account?.label}`
                : "Practice account balance"
            }
            className="flex h-10 max-w-[122px] items-center gap-2 rounded-full border border-line bg-card px-3 transition-colors hover:border-line-strong sm:max-w-[220px] sm:px-3.5"
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                inLeague ? "bg-brand" : "bg-up",
              )}
            />
            <span className="num truncate text-[12px] font-bold text-ink sm:text-[13px]">
              {formatSol(balance)}
            </span>
            <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted sm:inline">
              {inLeague ? account?.label : "SOL paper"}
            </span>
          </Link>

          {ctx ? (
            <>
              <span
                title={name}
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border border-line-strong bg-active text-[11px] font-bold text-soft sm:size-10 sm:text-[12px]",
                )}
              >
                {initials(name)}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink sm:w-auto sm:px-3"
                >
                  <svg
                    className="size-4 sm:hidden"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M15 17l5-5-5-5" />
                    <path d="M20 12H9" />
                    <path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
                  </svg>
                  <span className="hidden text-[13px] font-semibold sm:inline">
                    Sign out
                  </span>
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full bg-brand px-4 text-[13px] font-bold text-[#071021]"
            >
              Log in
            </Link>
          )}
        </div>
      </div>

      <div className="no-scrollbar overflow-x-auto border-t border-line px-6 pb-1 md:hidden">
        <div className="w-max">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}
