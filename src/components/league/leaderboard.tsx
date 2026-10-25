"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import type { StandingsSnapshot } from "@/lib/leagues/standings";
import {
  cn,
  formatAge,
  formatPct,
  formatSolAmount,
  formatTimeLeft,
  initials,
  toneForPnl,
} from "@/lib/utils";

const POLL_MS = 15_000;

type Status = "live" | "reconnecting";

export function Leaderboard({
  leagueId,
  initial,
  endsAt,
}: {
  leagueId: string;
  initial: StandingsSnapshot;
  endsAt: string;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [status, setStatus] = useState<Status>("live");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Same pattern as the Discover board: poll, pause while hidden, resync on
  // focus. The leaderboard is the one thing people leave open on a second
  // monitor, so it has to keep itself honest.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      if (document.visibilityState === "hidden") return;

      try {
        const response = await fetch(`/api/leagues/${leagueId}/leaderboard`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const next = (await response.json()) as StandingsSnapshot;
        if (cancelled) return;

        setSnapshot(next);
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("reconnecting");
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await load();
        if (!cancelled) schedule();
      }, POLL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [leagueId]);

  // Ages and the countdown tick on their own between polls.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = snapshot.standings;
  const leader = rows[0]?.pnlPct ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 text-[11px] font-bold uppercase tracking-wide">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              status === "live" ? "bg-up" : "bg-gold",
            )}
          />
          {status === "live"
            ? `Live · updated ${formatAge(snapshot.generatedAt, nowMs)} ago`
            : "Reconnecting to standings"}
        </span>

        <span className="num text-muted/80">
          {formatTimeLeft(endsAt, nowMs) === "ended"
            ? "League ended"
            : `Ends in ${formatTimeLeft(endsAt, nowMs)}`}
        </span>
      </div>

      {!snapshot.priced ? (
        <p className="border-b border-line bg-gold/10 px-5 py-2 text-[11px] font-semibold text-gold">
          Live prices are unavailable right now — cash balances are shown, open
          positions are not marked.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Nobody on the board yet"
            description="Share the invite code and the first person to join gets the top spot."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wider text-muted">
                <th className="w-14 px-5 py-2.5">#</th>
                <th className="px-3 py-2.5">Player</th>
                <th className="px-3 py-2.5 text-right">Value</th>
                <th className="px-3 py-2.5 text-right">P/L</th>
                <th className="px-3 py-2.5 text-right">Gain</th>
                <th className="px-5 py-2.5 text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const gap = row.pnlPct - leader;

                return (
                  <tr
                    key={row.userId}
                    className={cn(
                      "border-b border-line/60 last:border-0",
                      row.isYou ? "bg-active/50" : "hover:bg-hover/40",
                    )}
                  >
                    <td className="num px-5 py-3">
                      <span
                        className={cn(
                          "inline-grid size-6 place-items-center rounded-full text-[11px] font-bold",
                          row.rank === 1
                            ? "bg-gold/15 text-gold"
                            : row.rank === 2
                              ? "bg-hover text-soft"
                              : "text-muted",
                        )}
                      >
                        {row.rank}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-active text-[10px] font-bold text-soft">
                          {initials(row.username)}
                        </span>
                        <span className="truncate text-[13px] font-semibold text-ink">
                          {row.username}
                        </span>
                        {row.isYou ? (
                          <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-link">
                            you
                          </span>
                        ) : null}
                        {row.lateJoin ? (
                          <span
                            title="Joined after the league started — the full-balance start is why ranking is by % gain"
                            className="rounded-full border border-line-strong px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted"
                          >
                            late
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="num px-3 py-3 text-right text-[12px] font-semibold text-ink">
                      {formatSolAmount(row.equitySol)}
                      <span className="ml-1 text-[10px] font-normal text-muted">
                        SOL
                      </span>
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-[12px] font-semibold",
                        toneForPnl(row.pnlSol),
                      )}
                    >
                      {row.pnlSol >= 0 ? "+" : ""}
                      {formatSolAmount(row.pnlSol)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-[12px] font-bold",
                        toneForPnl(row.pnlPct),
                      )}
                    >
                      {formatPct(row.pnlPct, 2)}
                      {row.rank > 1 ? (
                        <span className="ml-1 text-[10px] font-normal text-muted">
                          {formatPct(gap, 1)}
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-muted">
                      {row.trades}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line px-5 py-2.5 text-[11px] text-muted/80">
        Ranked by % gain from each player&apos;s starting balance, with open
        positions marked to the live pool price.
      </p>
    </div>
  );
}
