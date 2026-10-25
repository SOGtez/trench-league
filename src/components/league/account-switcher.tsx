"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { switchAccount } from "@/app/(app)/leagues/actions";
import type { AccountSummary } from "@/lib/leagues/active-account";
import { cn, formatSolAmount } from "@/lib/utils";

/**
 * Which paper account the terminal is trading. Pills on the portfolio page,
 * a select inside the narrow trade panel — same action either way.
 */
export function AccountSwitcher({
  accounts,
  activeId,
  variant = "pills",
}: {
  accounts: AccountSummary[];
  activeId: string | null;
  variant?: "pills" | "select";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const choose = (accountId: string) => {
    if (accountId === activeId) return;
    setError(null);

    startTransition(async () => {
      const result = await switchAccount(accountId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (variant === "select") {
    return (
      <div>
        <label
          htmlFor="active-account"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted"
        >
          Trading account
        </label>
        <select
          id="active-account"
          value={activeId ?? ""}
          onChange={(event) => choose(event.target.value)}
          disabled={pending}
          className="h-11 w-full rounded-[12px] border border-line bg-bg px-3 text-[13px] font-semibold text-ink focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label} · {formatSolAmount(account.solBalance)} SOL
            </option>
          ))}
        </select>
        {error ? (
          <p className="mt-1.5 text-[11px] font-semibold text-down">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div
        role="group"
        aria-label="Trading account"
        className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 sm:mx-0 sm:px-0"
      >
        {accounts.map((account) => {
          const active = account.id === activeId;

          return (
            <button
              key={account.id}
              type="button"
              onClick={() => choose(account.id)}
              aria-pressed={active}
              disabled={pending}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold transition-colors disabled:opacity-60",
                active
                  ? "border-brand/40 bg-brand/12 text-link"
                  : "border-line bg-card text-soft hover:border-line-strong hover:bg-hover",
              )}
            >
              <span>{account.label}</span>
              <span className="num text-[11px] text-muted">
                {formatSolAmount(account.solBalance)} SOL
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] font-semibold text-down">{error}</p>
      ) : null}
    </div>
  );
}
