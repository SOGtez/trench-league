import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { CreateLeagueForm } from "@/components/league/create-league-form";
import { JoinLeagueForm } from "@/components/league/join-league-form";
import { PublicLeagueJoin } from "@/components/league/public-league-join";
import { PageHeader } from "@/components/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { getAuthContext } from "@/lib/auth";
import {
  getMyLeagues,
  getPublicLeagues,
  type LeagueStatus,
  type LeagueSummary,
} from "@/lib/leagues/queries";
import {
  cn,
  formatPct,
  formatSolAmount,
  formatTimeLeft,
  toneForPnl,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Leagues" };

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<LeagueStatus, string> = {
  upcoming: "starting soon",
  live: "live",
  ended: "ended",
};

function StatusPill({ status }: { status: LeagueStatus }) {
  return (
    <Pill
      tone={status === "live" ? "up" : status === "upcoming" ? "gold" : "neutral"}
    >
      {STATUS_LABEL[status]}
    </Pill>
  );
}

function LeagueRow({ league }: { league: LeagueSummary }) {
  const timeLeft = formatTimeLeft(league.endsAt);

  return (
    <Link
      href={`/leagues/${league.id}`}
      className="flex items-center gap-4 border-b border-line/60 px-5 py-4 transition-colors last:border-0 hover:bg-hover/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-bold text-ink">
            {league.name}
          </span>
          <StatusPill status={league.status} />
          {league.isCreator ? (
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
              you run it
            </span>
          ) : null}
        </div>
        <p className="num mt-1 text-[11px] text-muted">
          {league.members}/{league.maxPlayers} players ·{" "}
          {formatSolAmount(league.startingBalance)} SOL start ·{" "}
          {timeLeft === "ended" ? "ended" : `${timeLeft} left`}
        </p>
      </div>

      {league.myPnlPct !== null ? (
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "num text-[14px] font-bold",
              toneForPnl(league.myPnlPct),
            )}
          >
            {formatPct(league.myPnlPct, 2)}
          </p>
          <p className="num text-[11px] text-muted">
            {league.myEquitySol !== null
              ? `${formatSolAmount(league.myEquitySol)} SOL`
              : "—"}
          </p>
        </div>
      ) : (
        <span className="shrink-0 text-[11px] font-semibold text-muted">
          Not joined
        </span>
      )}
    </Link>
  );
}

export default async function LeaguesPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Leagues"
          subtitle="Run a paper-trading contest with friends."
        />
        <Card>
          <div className="p-8">
            <EmptyState
              title="Sign in to play leagues"
              description="Leagues give you a separate paper account with the same starting balance as everyone else."
              action={
                <Link
                  href="/login"
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Log in
                </Link>
              }
            />
          </div>
        </Card>
      </div>
    );
  }

  const [myLeagues, publicLeagues] = await Promise.all([
    getMyLeagues(ctx.user.id, ctx.accounts),
    getPublicLeagues(ctx.user.id),
  ]);

  const activeLeagueId = ctx.active?.leagueId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leagues"
        subtitle="Everyone starts with the same paper balance in a separate account. Highest % gain when the clock runs out wins."
        actions={
          <Link
            href="#create"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Create league
          </Link>
        }
      />

      {activeLeagueId ? (
        <p className="text-[12px] text-muted">
          You&apos;re currently trading in{" "}
          <span className="font-semibold text-ink">{ctx.active?.label}</span>.
          Switch accounts from the trade panel or your portfolio.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Your leagues"
          subtitle={
            myLeagues.length > 0
              ? `${myLeagues.length} league${myLeagues.length === 1 ? "" : "s"}`
              : undefined
          }
        />
        {myLeagues.length > 0 ? (
          <div>
            {myLeagues.map((league) => (
              <LeagueRow key={league.id} league={league} />
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title="You're not in a league yet"
              description="Create one below and share the invite code, or paste a code a friend sent you. Every league gets its own paper account, so your practice balance is untouched."
            />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="create" className="scroll-mt-24">
          <CardHeader
            title="Create a league"
            subtitle="You get the invite code and start playing immediately."
          />
          <CreateLeagueForm />
        </Card>

        <Card className="scroll-mt-24">
          <CardHeader
            title="Join with a code"
            subtitle="Eight characters, no 0/O or 1/I to keep it readable."
          />
          <JoinLeagueForm />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Public leagues"
          subtitle="Open leagues looking for players."
        />
        {publicLeagues.length > 0 ? (
          <div>
            {publicLeagues.map((league) => {
              const full = league.members >= league.maxPlayers;

              return (
                <div
                  key={league.id}
                  className="flex items-center gap-4 border-b border-line/60 px-5 py-4 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/leagues/${league.id}`}
                        className="truncate text-[14px] font-bold text-ink hover:text-link"
                      >
                        {league.name}
                      </Link>
                      <StatusPill status={league.status} />
                    </div>
                    <p className="num mt-1 text-[11px] text-muted">
                      {league.members}/{league.maxPlayers} players ·{" "}
                      {formatSolAmount(league.startingBalance)} SOL start ·{" "}
                      {formatTimeLeft(league.endsAt)} left
                    </p>
                  </div>

                  <PublicLeagueJoin
                    code={league.inviteCode}
                    disabled={full || league.status === "ended"}
                    label={full ? "Full" : "Join"}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title="No public leagues right now"
              description="Private leagues are invite-only — ask a friend for their code, or make the next one public."
            />
          </div>
        )}
      </Card>

      <p className="text-[12px] leading-relaxed text-muted">
        Leagues run on paper SOL only. Ranking is % gain, so a 5 SOL league and a
        100 SOL league are scored the same way, and joining late still gives you
        the full starting balance.
      </p>
    </div>
  );
}
