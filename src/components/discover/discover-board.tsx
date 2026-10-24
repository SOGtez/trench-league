"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { TokenRow, type TokenRowVariant } from "@/components/discover/token-row";
import { Card, CardHeader } from "@/components/ui/card";
import type {
  DiscoverColumns,
  DiscoverSnapshot,
  MarketToken,
} from "@/lib/market/types";
import { ageSeconds, cn, formatAge } from "@/lib/utils";

const POLL_MS = 15_000;
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type FilterId = "young" | "mcap" | "volume" | "curve";

const FILTERS: Array<{
  id: FilterId;
  label: string;
  test: (token: MarketToken, nowMs: number) => boolean;
}> = [
  {
    id: "young",
    label: "Age < 1h",
    test: (token, nowMs) => ageSeconds(token.createdAt, nowMs) < 3_600,
  },
  {
    id: "mcap",
    label: "FDV > $20K",
    test: (token) => (token.fdvUsd ?? 0) >= 20_000,
  },
  {
    id: "volume",
    label: "1h vol > $50K",
    test: (token) => (token.volume1hUsd ?? 0) >= 50_000,
  },
  {
    id: "curve",
    label: "Curve 50%+",
    test: (token) => (token.curveProgressPct ?? 0) >= 50,
  },
];

const COLUMNS: Array<{
  key: keyof DiscoverColumns;
  title: string;
  subtitle: string;
  variant: TokenRowVariant;
  emptyTitle: string;
  emptyDescription: string;
}> = [
  {
    key: "launches",
    title: "New launches",
    subtitle: "Newest on the curve",
    variant: "launch",
    emptyTitle: "No launches right now",
    emptyDescription:
      "Every token that hits the pump.fun curve shows up here the moment it launches.",
  },
  {
    key: "graduating",
    title: "About to graduate",
    subtitle: "Closest to filling the curve",
    variant: "graduating",
    emptyTitle: "No coins near graduation",
    emptyDescription:
      "The window between 40% and 100% of the bonding curve is where moves get violent.",
  },
  {
    key: "trending",
    title: "Trending",
    subtitle: "Graduated, ranked by flow",
    variant: "trending",
    emptyTitle: "Nothing trending yet",
    emptyDescription:
      "Graduated coins ranked by the feed's trending score — mostly what just left the curve.",
  },
];

type Status = "live" | "reconnecting";

export function DiscoverBoard({ initial }: { initial: DiscoverSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [status, setStatus] = useState<Status>("live");
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterId[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.generatedAt));

  // Poll in the background, pausing while the tab is hidden.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      if (document.visibilityState === "hidden") return;

      try {
        const response = await fetch("/api/market/discover", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const next = (await response.json()) as DiscoverSnapshot;
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
  }, []);

  // Ages tick on their own so a quiet feed still feels live.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const trimmedQuery = query.trim();
  const isMintQuery = MINT_PATTERN.test(trimmedQuery);
  const filtering = activeFilters.length > 0 || trimmedQuery.length > 0;

  const visible = useMemo(() => {
    const needle = trimmedQuery.toLowerCase();
    const match = (token: MarketToken) => {
      const matchesQuery =
        !needle ||
        token.symbol.toLowerCase().includes(needle) ||
        token.mint.toLowerCase().includes(needle);
      if (!matchesQuery) return false;

      return activeFilters.every((id) => {
        const filter = FILTERS.find((entry) => entry.id === id);
        return filter ? filter.test(token, nowMs) : true;
      });
    };

    return {
      launches: snapshot.columns.launches.filter(match),
      graduating: snapshot.columns.graduating.filter(match),
      trending: snapshot.columns.trending.filter(match),
    } satisfies DiscoverColumns;
  }, [snapshot, trimmedQuery, activeFilters, nowMs]);

  const toggleFilter = (id: FilterId) => {
    setActiveFilters((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  const total = visible.launches.length + visible.graduating.length + visible.trending.length;
  const updated = formatAge(snapshot.generatedAt, nowMs);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (isMintQuery) router.push(`/coin/${trimmedQuery}`);
          }}
          className="relative w-full lg:max-w-[420px]"
        >
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, ticker, or paste a contract address"
            aria-label="Search tokens"
            className={cn(
              "h-11 w-full rounded-[12px] border border-line bg-card pl-10 text-[13px] text-ink placeholder:text-muted/70 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20",
              isMintQuery ? "pr-16" : "pr-3.5",
            )}
          />
          {isMintQuery ? (
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[9px] bg-active px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-soft transition-colors hover:bg-line-strong hover:text-ink"
            >
              Open
            </button>
          ) : null}
        </form>

        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 lg:mx-0 lg:px-0">
          {FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.id);

            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFilter(filter.id)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[12px] font-semibold transition-colors",
                  active
                    ? "border-brand/40 bg-brand/12 text-link"
                    : "border-line bg-card text-soft hover:border-line-strong hover:bg-hover",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
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
            ? `Live · updated ${updated} ago`
            : "Reconnecting to the feed"}
        </span>

        <span className="num text-muted/80">
          {snapshot.solPriceUsd
            ? `SOL $${snapshot.solPriceUsd.toFixed(2)} · `
            : ""}
          {total} coins
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const rows = visible[column.key];

          return (
            <Card key={column.key} className="flex min-w-0 flex-col">
              <CardHeader
                title={column.title}
                subtitle={column.subtitle}
                action={
                  <span className="num text-[11px] font-bold text-muted">
                    {rows.length}
                  </span>
                }
              />
              <div className="flex flex-1 flex-col p-2">
                {rows.length > 0 ? (
                  <div className="divide-y divide-line/60">
                    {rows.map((token) => (
                      <TokenRow
                        key={token.mint}
                        token={token}
                        variant={column.variant}
                        nowMs={nowMs}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-1 p-2">
                    <EmptyState
                      className="flex-1"
                      title={
                        filtering
                          ? "No coins match"
                          : snapshot.degraded
                            ? "Feed unavailable"
                            : column.emptyTitle
                      }
                      description={
                        filtering
                          ? "Clear a filter or the search to see the full board."
                          : snapshot.degraded
                            ? "The market feed didn't answer. The board retries every 15 seconds."
                            : column.emptyDescription
                      }
                    />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted/70">
        Prices and curve progress come from the live Solana market. Curve % is an
        estimate from FDV and the current SOL price — exact fills land in the
        trading engine.
      </p>
    </div>
  );
}
