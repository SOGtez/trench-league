import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardHeader } from "@/components/ui/card";
import { InviteCode } from "@/components/league/invite-code";
import { Leaderboard } from "@/components/league/leaderboard";
import { PublicLeagueJoin } from "@/components/league/public-league-join";
import { TradeInLeagueButton } from "@/components/league/trade-in-league-button";
import { Pill } from "@/components/ui/pill";
import { buttonStyles } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth";
import { leagueStatus, type LeagueStatus } from "@/lib/leagues/queries";
import {
  getLeagueStandings,
  type StandingsSnapshot,
} from "@/lib/leagues/standings";
import { getSolPriceUsd } from "@/lib/market/sol";
import { isTradingConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  formatPct,
  formatSolAmount,
  formatTimeLeft,
  toneForPnl,
} from "@/lib/utils";

type LeagueRow = {
  id: string;
  name: string;
  mode: "paper" | "calls";
  visibility: "private" | "public";
  starting_balance: string | number;
  starts_at: string;
  ends_at: string;
  max_players: number;
  invite_code: string;
  created_by: string;
};

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<LeagueStatus, string> = {
  upcoming: "starting soon",
  live: "live",
  ended: "ended",
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("leagues")
    .select("name")
    .eq("id", id)
    .maybeSingle<{ name: string }>();

  return { title: data?.name ?? "League" };
}

export default async function LeaguePage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getAuthContext();

  if (!ctx) notFound();

  const supabase = await createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, mode, visibility, starting_balance, starts_at, ends_at, max_players, invite_code, created_by",
    )
    .eq("id", id)
    .maybeSingle<LeagueRow>();

  // RLS already hides private leagues you're not in, so a miss covers both
  // "wrong id" and "not your league".
  if (!league) notFound();

  const { data: membership } = await supabase
    .from("league_members")
    .select("account_id")
    .eq("league_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle<{ account_id: string | null }>();

  const isMember = Boolean(membership);

  if (!isMember && league.visibility !== "public") notFound();

  const status = leagueStatus(league.starts_at, league.ends_at);
  const ending = formatTimeLeft(league.ends_at);

  const [snapshot, solPriceUsd] = await Promise.all([
    isTradingConfigured()
      ? getLeagueStandings({
          leagueId: id,
          startsAt: league.starts_at,
          currentUserId: ctx.user.id,
        })
      : Promise.resolve<StandingsSnapshot>({
          generatedAt: new Date().toISOString(),
          solPriceUsd: null,
          priced: false,
          standings: [],
        }),
    getSolPriceUsd(),
  ]);

  const mine = snapshot.standings.find((row) => row.userId === ctx.user.id) ?? null;
  const myAccountId = membership?.account_id ?? null;
  const tradingHere = Boolean(myAccountId && ctx.active?.id === myAccountId);

  const startsOn = new Date(league.starts_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endsOn = new Date(league.ends_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-5">
      <Link
        href="/leagues"
        className="inline-flex items-center gap-2 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Leagues
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[24px] font-extrabold tracking-tight">
              {league.name}
            </h1>
            <Pill
              tone={
                status === "live"
                  ? "up"
                  : status === "upcoming"
                    ? "gold"
                    : "neutral"
              }
            >
              {STATUS_LABEL[status]}
            </Pill>
            <Pill tone="brand">
              {formatSolAmount(Number(league.starting_balance))} SOL start
            </Pill>
          </div>
          <p className="num mt-1 text-[12px] text-muted">
            {snapshot.standings.length}/{league.max_players} players ·{" "}
            {startsOn} → {endsOn}
            {status === "live" && ending !== "ended"
              ? ` · ${ending} left`
              : ""}
            {solPriceUsd ? ` · SOL $${solPriceUsd.toFixed(2)}` : ""}
          </p>
        </div>

        {isMember && myAccountId ? (
          tradingHere ? (
            <Link
              href="/discover"
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              Trading here — find a coin
            </Link>
          ) : (
            <TradeInLeagueButton
              accountId={myAccountId}
              label="Trade in this league"
            />
          )
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            title="Leaderboard"
            subtitle="Live % gain, marked to pool prices every 15 seconds."
          />
          <Leaderboard
            leagueId={league.id}
            initial={snapshot}
            endsAt={league.ends_at}
          />
        </Card>

        <div className="space-y-5">
          {isMember ? (
            <Card>
              <CardHeader title="Your league account" />
              <div className="space-y-3 p-5">
                {mine ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold text-muted">
                        Rank
                      </span>
                      <span className="num text-[18px] font-bold text-ink">
                        #{mine.rank}
                        <span className="ml-1 text-[12px] font-medium text-muted">
                          of {snapshot.standings.length}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-muted">Value</span>
                      <span className="num text-[13px] font-semibold text-ink">
                        {formatSolAmount(mine.equitySol)} SOL
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-muted">P/L</span>
                      <span
                        className={cn(
                          "num text-[13px] font-bold",
                          toneForPnl(mine.pnlSol),
                        )}
                      >
                        {mine.pnlSol >= 0 ? "+" : ""}
                        {formatSolAmount(mine.pnlSol)} SOL ·{" "}
                        {formatPct(mine.pnlPct, 2)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-muted">Trades</span>
                      <span className="num text-[13px] font-semibold text-ink">
                        {mine.trades}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-muted">Positions</span>
                      <span className="num text-[13px] font-semibold text-ink">
                        {mine.openPositions}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-[12px] text-muted">
                    Your account is ready — standings appear once the board
                    loads.
                  </p>
                )}

                <Link
                  href="/portfolio"
                  className={cn(
                    buttonStyles({ variant: "secondary", size: "sm" }),
                    "w-full",
                  )}
                >
                  Open portfolio
                </Link>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Join this league" />
              <div className="space-y-3 p-5">
                <p className="text-[12px] leading-relaxed text-muted">
                  This league is public. You get your own account with{" "}
                  {formatSolAmount(Number(league.starting_balance))} paper SOL and
                  enter the board at 0%.
                </p>
                <PublicLeagueJoin
                  code={league.invite_code}
                  disabled={status === "ended"}
                  label={status === "ended" ? "Ended" : "Join league"}
                />
              </div>
            </Card>
          )}

          {isMember ? (
            <Card>
              <CardHeader title="Invite friends" />
              <div className="space-y-2.5 p-5">
                <p className="text-[12px] text-muted">
                  Send this code. Anyone with it gets their own account in this
                  league.
                </p>
                <InviteCode code={league.invite_code} />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="How it scores" />
            <div className="space-y-2.5 p-5 text-[12px] leading-relaxed text-muted">
              <p>
                Everyone starts with{" "}
                {formatSolAmount(Number(league.starting_balance))} paper SOL in a
                separate league account.
              </p>
              <p>
                Rank is <span className="font-semibold text-soft">% gain</span>,
                not raw value, so a small starting balance isn&apos;t a
                disadvantage. Open positions are marked to the live pool price.
              </p>
              <p>
                Joining late still gives the full balance — that&apos;s why the
                board badges late joins and scores on % rather than absolute
                profit.
              </p>
              <p className="text-[11px] text-muted/70">
                Paper only. No wallet, no deposits, no real money.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
