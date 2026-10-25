import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPct, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

type ProfileRow = {
  username: string | null;
  avatar_url: string | null;
  created_at: string;
  points_total: number;
  streak_current: number;
  streak_best: number;
  calls_scored: number;
  calls_correct: number;
};

type BadgeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

type AwardRow = { badge_id: string; awarded_at: string };

export default async function ProfilePage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" subtitle="Your public trading identity." />
        <Card>
          <div className="p-8">
            <EmptyState
              title="Sign in to see your profile"
              description="Points, streaks and badges are earned per account."
            />
          </div>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();

  const [profileResult, badgesResult, awardsResult, winsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "username, avatar_url, created_at, points_total, streak_current, streak_best, calls_scored, calls_correct",
        )
        .eq("id", ctx.user.id)
        .maybeSingle<ProfileRow>(),
      supabase
        .from("badges")
        .select("id, code, name, description")
        .order("name")
        .returns<BadgeRow[]>(),
      supabase
        .from("user_badges")
        .select("badge_id, awarded_at")
        .eq("user_id", ctx.user.id)
        .returns<AwardRow[]>(),
      supabase
        .from("league_members")
        .select("league_id")
        .eq("user_id", ctx.user.id)
        .eq("final_rank", 1),
    ]);

  const profile = profileResult.data;
  const name = profile?.username ?? "—";
  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const scored = Number(profile?.calls_scored ?? 0);
  const correct = Number(profile?.calls_correct ?? 0);
  const accuracy = scored > 0 ? (correct / scored) * 100 : null;
  const wins = winsResult.data?.length ?? 0;

  const earned = new Map(
    ((awardsResult.data ?? []) as AwardRow[]).map((award) => [
      award.badge_id,
      award.awarded_at,
    ]),
  );
  const badges = (badgesResult.data ?? []) as BadgeRow[];

  const stats = [
    { label: "Points", value: String(Number(profile?.points_total ?? 0)) },
    { label: "Streak", value: String(Number(profile?.streak_current ?? 0)) },
    { label: "Best streak", value: String(Number(profile?.streak_best ?? 0)) },
    {
      label: "Accuracy",
      value: accuracy === null ? "—" : formatPct(accuracy, 0).replace("+", ""),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your public trading identity." />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full border border-line-strong bg-active text-[18px] font-bold text-soft">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-extrabold tracking-tight">
              {name}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">Joined {joined}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[12px] border border-line bg-header px-3.5 py-3"
            >
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {stat.label}
              </dt>
              <dd className="num mt-1 text-[15px] font-bold">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-[12px] text-muted">
          {scored > 0
            ? `${correct} of ${scored} calls called right · ${wins} league win${wins === 1 ? "" : "s"}`
            : "No scored calls yet — your first round is on the Calls page."}
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Badges"
          subtitle="Earned by winning leagues and calling streaks."
          action={
            <span className="num text-[11px] font-bold text-muted">
              {earned.size}/{badges.length}
            </span>
          }
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {badges.map((badge) => {
            const awardedAt = earned.get(badge.id);
            const has = Boolean(awardedAt);

            return (
              <div
                key={badge.id}
                className={cn(
                  "rounded-[12px] border px-4 py-3",
                  has
                    ? "border-gold/30 bg-gold/8"
                    : "border-line bg-header/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-[13px] font-bold",
                      has ? "text-gold" : "text-soft",
                    )}
                  >
                    {badge.name}
                  </p>
                  {has ? (
                    <Pill tone="gold">Earned</Pill>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted/70">
                      Locked
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {badge.description ?? ""}
                </p>
                {awardedAt ? (
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-muted/70">
                    {new Date(awardedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
