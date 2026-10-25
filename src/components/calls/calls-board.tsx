"use client";

import { useCallback, useEffect, useState } from "react";

import { pickSide } from "@/app/(app)/calls/actions";
import { CallCard } from "@/components/calls/call-card";
import { EmptyState } from "@/components/empty-state";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import {
  formatCountdown,
  type CallSide,
  type CallView,
  type CallsView,
} from "@/lib/calls/types";
import { cn, formatAge, formatPct } from "@/lib/utils";

/** Rounds turn over every 15 minutes; 5s keeps the countdown honest. */
const POLL_MS = 5_000;

type Status = "live" | "reconnecting";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-card px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="num mt-1 text-[18px] font-bold text-ink">{value}</p>
    </div>
  );
}

function SideLabel(call: CallView, side: CallSide): string {
  return side === "a" ? call.optionA : call.optionB;
}

function HistoryRow({ call, nowMs }: { call: CallView; nowMs: number }) {
  const resultText = call.result ? SideLabel(call, call.result) : "—";
  const mineText = call.myPick ? SideLabel(call, call.myPick) : "No pick";
  const awaiting = call.state === "locked";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-soft">
          {call.question}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {mineText} ·{" "}
          {awaiting
            ? `closes in ${formatCountdown(Date.parse(call.resolvesAt) - nowMs)}`
            : `${formatAge(call.resolvesAt, nowMs)} ago`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {awaiting ? (
          <Pill tone="gold">Awaiting close</Pill>
        ) : call.myCorrect === true ? (
          <Pill tone="up">+{call.myPoints ?? 0}</Pill>
        ) : call.myCorrect === false ? (
          <Pill tone="down">Missed</Pill>
        ) : (
          <Pill tone="neutral">Sat out</Pill>
        )}
        <span className="num hidden text-[11px] font-semibold text-muted sm:inline">
          {resultText}
        </span>
      </div>
    </div>
  );
}

export function CallsBoard({ initial }: { initial: CallsView }) {
  const [view, setView] = useState(initial);
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.generatedAt));
  const [status, setStatus] = useState<Status>("live");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/calls/round?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const next = (await response.json()) as CallsView;
      setView(next);
      setStatus("live");
      return next;
    } catch {
      setStatus("reconnecting");
      return null;
    }
  }, []);

  // Poll while the tab is visible; a hidden tab costs nothing.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (document.visibilityState !== "hidden") await refresh();
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    };

    // Load once on mount so a freshly opened page catches up immediately.
    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Countdowns tick locally, so a stalled poll never freezes the clock.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (flash === null) return;
    const id = window.setTimeout(() => setFlash(null), 2_500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const handlePick = async (callId: string, side: CallSide) => {
    setPending(callId);
    setError(null);

    const result = await pickSide(callId, side);

    if (result.error) {
      setError(result.error);
      setPending(null);
      await refresh();
      return;
    }

    // Show the pick immediately; the poll brings the authoritative copy.
    setView((current) => ({
      ...current,
      active: current.active.map((call) =>
        call.id === callId ? { ...call, myPick: side } : call,
      ),
    }));
    setFlash(callId);
    setPending(null);
    await refresh();
  };

  const { stats } = view;
  const roundCalls = view.active;
  const roundMs = view.roundEndsAt ? Date.parse(view.roundEndsAt) - nowMs : null;

  const answered = new Set(roundCalls.map((call) => call.id));
  const picked = roundCalls.filter((call) => call.myPick !== null).length;
  // Rounds still closing show above the scored ones so a pick never vanishes.
  const history = [...view.pending, ...view.recent];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Points" value={String(stats.points)} />
        <StatTile label="Streak" value={String(stats.streak)} />
        <StatTile label="Best streak" value={String(stats.bestStreak)} />
        <StatTile
          label="Accuracy"
          value={stats.accuracyPct === null ? "—" : formatPct(stats.accuracyPct, 0).replace("+", "")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              status === "live" ? "bg-up" : "bg-gold",
            )}
          />
          {status === "live"
            ? view.roundId
              ? `Round ${view.roundId.slice(11, 16)} UTC`
              : "Live"
            : "Reconnecting"}
        </span>
        <span className="num text-muted/80">
          {stats.correct}/{stats.scored} called right
        </span>
      </div>

      <Card>
        <CardHeader
          title="This round"
          subtitle="One up/down call and one head-to-head. Picks lock five minutes before the close."
          action={
            roundMs !== null ? (
              <span className="num text-[12px] font-bold text-soft">
                {formatCountdown(roundMs)}
              </span>
            ) : null
          }
        />

        <div className="p-4">
          {error ? (
            <p
              role="alert"
              className="mb-3 rounded-[10px] border border-down/30 bg-down/10 px-3 py-2 text-[12px] font-semibold text-down"
            >
              {error}
            </p>
          ) : null}

          {roundCalls.length > 0 ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {roundCalls.map((call) => (
                  <div
                    key={call.id}
                    className={cn(
                      "rounded-[18px] transition-shadow",
                      flash === call.id && "ring-2 ring-brand/40",
                    )}
                  >
                    <CallCard
                      call={call}
                      nowMs={nowMs}
                      pending={pending === call.id}
                      onPick={handlePick}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted/80">
                {picked === answered.size
                  ? "Both picks in. Results land the moment the round closes."
                  : `${picked} of ${answered.size} picked this round.`}
              </p>
            </>
          ) : (
            <EmptyState
              title="No open round"
              description="The next round opens automatically — it takes a live market read to build one, so give it a few seconds."
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Past calls"
          subtitle="Scored against the market close. Points follow the streak."
        />
        {history.length > 0 ? (
          <div className="divide-y divide-line/60">
            {history.map((call) => (
              <HistoryRow key={call.id} call={call} nowMs={nowMs} />
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              title="No scored calls yet"
              description="Your first result appears here once a round you picked has closed."
            />
          </div>
        )}
      </Card>

      <p className="text-[11px] text-muted/70">
        Scoring: 100 points for a correct call, +25 per point of current streak
        (capped at four), +50 when fewer than 40% of players picked your side. A
        miss resets the streak.
      </p>
    </div>
  );
}
