import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { NavLinks } from "@/components/nav-links";
import { Wordmark } from "@/components/logo";
import { displayName, type AuthContext } from "@/lib/auth";
import { cn, formatSol, initials } from "@/lib/utils";

export function AppHeader({ ctx }: { ctx: AuthContext | null }) {
  const name = ctx ? displayName(ctx) : "guest";
  const balance = ctx?.practice?.sol_balance ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-header/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center gap-6 px-6">
        <Wordmark className="shrink-0" />

        <nav className="hidden md:block" aria-label="Main">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/portfolio"
            title="Practice account balance"
            className="flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3.5 transition-colors hover:border-line-strong"
          >
            <span className="size-1.5 rounded-full bg-up" aria-hidden />
            <span className="num text-[13px] font-bold text-ink">
              {formatSol(balance)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
              SOL paper
            </span>
          </Link>

          {ctx ? (
            <>
              <span
                title={name}
                className={cn(
                  "grid size-10 place-items-center rounded-full border border-line-strong bg-active text-[12px] font-bold text-soft",
                )}
              >
                {initials(name)}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center rounded-full px-3 text-[13px] font-semibold text-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  Sign out
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
