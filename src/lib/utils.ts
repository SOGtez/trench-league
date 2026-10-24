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

/** "AbCd…xYz9" — Solana addresses are too long for table cells. */
export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
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
