import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PaperLabel } from "@/components/paper-label";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { displayName, type AuthContext } from "@/lib/auth";
import { cn, formatPct, formatSol, toneForPnl } from "@/lib/utils";

export function HomeDashboard({ ctx }: { ctx: AuthContext }) {
  const name = displayName(ctx);
  const balance = ctx.practice?.sol_balance ?? 0;
  const starting = ctx.practice?.starting_balance ?? 10;
  const gainSol = balance - starting;
  const gainPct = starting > 0 ? (gainSol / starting) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Home
          </p>
          <h1 className="mt-1 truncate text-[26px] font-extrabold tracking-tight">
            gm, {name}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Fake SOL, live prices. Let&apos;s see if you have the eye.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/discover" className={buttonStyles({ size: "md" })}>
            Start trading
          </Link>
          <Link
            href="/leagues"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Join league
          </Link>
          <Link
            href="/leagues"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Create league
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      Practice account
                    </span>
                    <Pill tone="brand">Paper</Pill>
                  </div>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="num text-[34px] font-bold leading-none">
                      {formatSol(balance)}
                    </span>
                    <span className="text-[13px] font-semibold text-muted">
                      SOL
                    </span>
                  </div>

                  <p
                    className={cn(
                      "mt-2 text-[13px] font-semibold",
                      toneForPnl(gainPct),
                    )}
                  >
                    {formatPct(gainPct)} all-time ·{" "}
                    <span className="num">
                      {gainSol >= 0 ? "+" : ""}
                      {formatSol(gainSol)} SOL
                    </span>
                  </p>
                </div>

                <div
                  className="inline-flex rounded-full border border-line bg-header p-1"
                  aria-hidden
                >
                  {["24h", "7d", "All"].map((range, index) => (
                    <span
                      key={range}
                      className={cn(
                        "px-3 py-1.5 text-[12px] font-semibold",
                        index === 0
                          ? "rounded-full bg-active text-ink"
                          : "text-muted",
                      )}
                    >
                      {range}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid h-[180px] place-items-center rounded-[12px] border border-dashed border-line bg-bg/40 px-6 text-center">
                <p className="text-[13px] text-muted">
                  Balance history starts after your first trade.
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Win rate" value="—" />
                <Stat label="Trades" value="0" />
                <Stat label="Best trade" value="—" />
                <Stat label="Avg hold" value="—" />
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Your leagues"
              subtitle="Paper and calls leagues you've joined."
              action={
                <Link
                  href="/leagues"
                  className="text-[12px] font-semibold text-link hover:underline"
                >
                  Browse
                </Link>
              }
            />
            <div className="p-5">
              <EmptyState
                title="No leagues yet"
                description="Create a league with your friends or join a public one. Paper leagues rank by % gain; calls leagues rank by points."
                action={
                  <Link
                    href="/leagues"
                    className={buttonStyles({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Browse leagues
                  </Link>
                }
              />
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader
              title="Today's call"
              action={
                <Link
                  href="/calls"
                  className="text-[12px] font-semibold text-link hover:underline"
                >
                  All calls
                </Link>
              }
            />
            <div className="p-5">
              <EmptyState
                title="No call is open"
                description="A new up/down call drops each weekday. Pick a side before the lock to earn points."
              />
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
                <span className="text-[12px] font-semibold text-muted">
                  Current streak
                </span>
                <span className="num text-[13px] font-bold text-soft">0</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Open positions"
              action={
                <Link
                  href="/discover"
                  className="text-[12px] font-semibold text-link hover:underline"
                >
                  Discover
                </Link>
              }
            />
            <div className="p-5">
              <EmptyState
                title="Nothing open"
                description="Tokens you're holding will show live P/L here."
                action={
                  <Link
                    href="/discover"
                    className={buttonStyles({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Find a coin
                  </Link>
                }
              />
              <div className="mt-4">
                <PaperLabel />
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-header px-3.5 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="num mt-1 text-[15px] font-bold text-ink">{value}</dd>
    </div>
  );
}
