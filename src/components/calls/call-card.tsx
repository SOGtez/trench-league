"use client";

import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import {
  formatCountdown,
  type CallSide,
  type CallView,
} from "@/lib/calls/types";
import { cn, formatPct, formatUsdPrice } from "@/lib/utils";

/**
 * One call: the question, the two sides, and what happened.
 *
 * The lock is visual only — the server re-checks it — but the countdown makes
 * the deadline honest, and the split bar appears exactly when picks close.
 */
export function CallCard({
  call,
  nowMs,
  pending,
  onPick,
}: {
  call: CallView;
  nowMs: number;
  pending: boolean;
  onPick: (callId: string, side: CallSide) => void;
}) {
  const open = call.state === "open";
  const resolved = call.state === "resolved";

  const locksIn = Date.parse(call.locksAt) - nowMs;
  const resolvesIn = Date.parse(call.resolvesAt) - nowMs;

  const label = open
    ? `Locks in ${formatCountdown(locksIn)}`
    : resolved
      ? "Scored"
      : `Resolves in ${formatCountdown(resolvesIn)}`;

  const tallyTotal = (call.tally?.a ?? 0) + (call.tally?.b ?? 0);
  const shareA = tallyTotal > 0 ? ((call.tally?.a ?? 0) / tallyTotal) * 100 : 50;

  return (
    <Card
      className={cn(
        "flex flex-col p-4 transition-colors",
        open && "border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Pill tone={call.kind === "updown" ? "brand" : "neutral"}>
          {call.kind === "updown" ? "Up or down" : "Head to head"}
        </Pill>
        <span
          className={cn(
            "num text-[11px] font-bold uppercase tracking-wide",
            open && locksIn < 60_000 ? "text-gold" : "text-muted",
          )}
        >
          {label}
        </span>
      </div>

      <p className="mt-2.5 text-[14px] font-semibold leading-snug text-ink">
        {call.question}
      </p>

      <div className="mt-2 space-y-1">
        {call.legs.map((leg) => (
          <div
            key={leg.mint}
            className="flex items-center justify-between gap-3 text-[12px]"
          >
            <span className="truncate font-semibold text-soft">${leg.symbol}</span>
            <span className="num shrink-0 text-muted">
              {formatUsdPrice(leg.priceOpen)}
              {leg.priceClose !== null ? (
                <>
                  <span className="mx-1 text-muted/50">→</span>
                  <span
                    className={cn(
                      (leg.changePct ?? 0) >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {formatUsdPrice(leg.priceClose)}
                  </span>
                  <span className="ml-1.5 text-[11px] text-muted/80">
                    {formatPct(leg.changePct)}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((side) => {
          const text = side === "a" ? call.optionA : call.optionB;
          const mine = call.myPick === side;
          const winning = resolved && call.result === side;

          return (
            <button
              key={side}
              type="button"
              disabled={!open || pending}
              onClick={() => onPick(call.id, side)}
              aria-pressed={mine}
              className={cn(
                "flex flex-col items-start rounded-[12px] border px-3 py-2.5 text-left transition-colors",
                "disabled:cursor-not-allowed",
                winning
                  ? "border-up/40 bg-up/12"
                  : mine
                    ? "border-brand/50 bg-brand/12"
                    : "border-line bg-header",
                open && !pending && "hover:border-line-strong hover:bg-hover",
                !open && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "text-[13px] font-bold",
                  winning
                    ? "text-up"
                    : mine
                      ? "text-link"
                      : "text-soft",
                )}
              >
                {text}
              </span>
              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                {mine ? "Your pick" : open ? "Pick" : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {!open && tallyTotal > 0 ? (
        <div className="mt-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
            <div className="bg-up/70" style={{ width: `${shareA}%` }} />
            <div className="flex-1 bg-down/70" />
          </div>
          <div className="num mt-1 flex justify-between text-[10px] text-muted">
            <span>{call.tally?.a ?? 0} picked {call.optionA}</span>
            <span>{call.tally?.b ?? 0} picked {call.optionB}</span>
          </div>
        </div>
      ) : null}

      {resolved ? (
        <p className="mt-3 text-[12px] font-semibold">
          {call.myPick === null ? (
            <span className="text-muted">No pick</span>
          ) : call.myCorrect ? (
            <span className="text-up">
              Correct · +{call.myPoints ?? 0} pts
            </span>
          ) : (
            <span className="text-down">Missed</span>
          )}
        </p>
      ) : null}
    </Card>
  );
}
