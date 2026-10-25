import Link from "next/link";

import { Wordmark } from "@/components/logo";
import { PaperLabel } from "@/components/paper-label";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    title: "Paper trade live coins",
    body: "Real prices, real price impact, real fees — with fake SOL. A 5 SOL buy on a thin coin moves the price against you, just like the real thing.",
    icon: (
      <>
        <path d="M4 17.5 9 12l4 3.5 7-8.5" />
        <path d="M4 21h16" />
      </>
    ),
  },
  {
    title: "Create leagues with friends",
    body: "Set a starting balance and a window, share an invite code, and let the leaderboard settle it. Paper leagues trade; calls leagues predict.",
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 6.5a3 3 0 0 1 0 5.8" />
        <path d="M17.5 19a5 5 0 0 0-2-4" />
      </>
    ),
  },
  {
    title: "Make price calls",
    body: "Call the next move on SOL or a memecoin head-to-head. Correct picks earn points, long streaks earn more, contrarian picks pay a bonus.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      </>
    ),
  },
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-1.5">
            <Link
              href="/login"
              className={buttonStyles({ variant: "ghost", className: "h-10" })}
            >
              Log in
            </Link>
            <Link href="/signup" className={buttonStyles({ className: "h-10" })}>
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-6">
        <section className="mx-auto max-w-[820px] py-20 text-center sm:py-28">
          <span className="inline-flex items-center rounded-full border border-line-strong bg-card px-3.5 py-1.5">
            <PaperLabel />
          </span>

          <h1 className="mt-7 text-[38px] font-extrabold leading-[1.04] tracking-[-0.03em] sm:text-[58px]">
            Practice memecoin trading
            <br className="hidden sm:block" /> with fake SOL.
            <span className="mt-2 block text-[22px] leading-[1.15] text-muted sm:text-[40px]">
              Compete with friends for bragging rights.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-[580px] text-[15px] leading-relaxed text-muted sm:text-base">
            Live Solana prices, realistic fills, zero risk. Start with 10 paper
            SOL, run a league with your friends, and find out who actually has
            the eye.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={buttonStyles({ size: "lg", className: "w-full sm:w-auto" })}
            >
              Create free account
            </Link>
            <Link
              href="/login"
              className={buttonStyles({
                variant: "secondary",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              Log in
            </Link>
          </div>

          <p className="mt-4 text-[12px] text-muted">
            Email or Google · no wallet required
          </p>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="p-6">
              <span className="grid size-10 place-items-center rounded-[12px] border border-line-strong bg-header text-brand">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {feature.icon}
                </svg>
              </span>
              <h2 className="mt-4 text-[15px] font-bold tracking-tight">
                {feature.title}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {feature.body}
              </p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 px-6 py-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Trench League</span>
          <span>
            No real money. Ever. No deposits, no withdrawals, no wallet.
          </span>
        </div>
      </footer>
    </div>
  );
}
