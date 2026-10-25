export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Paper SOL, always two decimals with thousands separators. */
export function formatSol(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Percentage with an explicit sign, e.g. "+12.4%" / "-3.1%". */
export function formatPct(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

/** Compact USD for market caps: $48.2K, $3.1M. */
export function formatCompactUsd(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "$0";
  return `$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)}`;
}

/** Token quantities: 1.24M, 850.2K, 12.5. */
export function formatTokenAmount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Memecoin prices need significant digits, not fixed decimals. */
export function formatUsdPrice(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 4 })}`;
}

/** SOL amounts with four decimals — paper balances move in small steps. */
export function formatSolAmount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.0000";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/** "AbCd…xYz9" — Solana addresses are too long for table cells. */
export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Seconds since an ISO timestamp, floored at 0. */
export function ageSeconds(
  iso: string | null | undefined,
  nowMs = Date.now(),
): number {
  if (!iso) return 0;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.round((nowMs - then) / 1000));
}

/** Trading-terminal age: "42s", "7m", "3h 12m", "4d". */
export function formatAge(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (!iso) return "—";
  const seconds = ageSeconds(iso, nowMs);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(seconds / 86_400);
  if (days < 30) {
    const hours = Math.floor((seconds % 86_400) / 3_600);
    return hours > 0 && days < 7 ? `${days}d ${hours}h` : `${days}d`;
  }
  return `${Math.floor(days / 30)}mo`;
}

export function initials(name: string | null | undefined): string {
  const clean = (name ?? "?").replace(/[^a-zA-Z0-9]/g, "");
  return (clean.slice(0, 2) || "?").toUpperCase();
}

/** 1.234 SOL -> "1.23" (used for pill/balance copy). */
export function toneForPnl(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n > 0) return "text-up";
  if (n < 0) return "text-down";
  return "text-muted";
}
