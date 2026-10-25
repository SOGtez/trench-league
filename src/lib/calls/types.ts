/** Shared call types and round constants — safe to import from the browser. */

/** Rounds start every 15 minutes, on the quarter hour. */
export const CALL_ROUND_MINUTES = 15;

/** Picks close five minutes before the round resolves. */
export const CALL_LOCK_MINUTES = 10;

/** Order a round's two calls: up/down first, then head-to-head. */
export function byKind(a: { kind: CallKind }, b: { kind: CallKind }): number {
  return a.kind === b.kind ? 0 : a.kind === "updown" ? -1 : 1;
}

/** "48s" / "4:12" for a countdown that ticks every second. */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export type CallSide = "a" | "b";
export type CallKind = "updown" | "h2h";
export type CallState = "open" | "locked" | "resolved";

/** One price leg: the coin being called, and its price at open and close. */
export type CallLeg = {
  mint: string;
  symbol: string;
  priceOpen: number | null;
  priceClose: number | null;
  changePct: number | null;
};

export type CallView = {
  id: string;
  kind: CallKind;
  roundId: string | null;
  question: string;
  optionA: string;
  optionB: string;
  legs: CallLeg[];
  locksAt: string;
  resolvesAt: string;
  state: CallState;
  result: CallSide | null;
  /** How the crowd split, only once picks are locked. */
  tally: { a: number; b: number } | null;
  myPick: CallSide | null;
  myPoints: number | null;
  myCorrect: boolean | null;
};

export type CallStats = {
  points: number;
  streak: number;
  bestStreak: number;
  scored: number;
  correct: number;
  accuracyPct: number | null;
};

export type CallsView = {
  generatedAt: string;
  roundId: string | null;
  /** When the current round resolves — null when nothing is open. */
  roundEndsAt: string | null;
  /** The newest round: what you can pick, or what you just picked. */
  active: CallView[];
  /** Rounds that closed but have not been scored yet. */
  pending: CallView[];
  /** Scored calls, newest first. */
  recent: CallView[];
  stats: CallStats;
};
