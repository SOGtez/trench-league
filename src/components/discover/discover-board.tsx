"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { TokenRow, type TokenRowVariant } from "@/components/discover/token-row";
import { useLivePrices } from "@/lib/market/live-prices";
import type {
  DiscoverColumns,
  DiscoverSnapshot,
  MarketToken,
} from "@/lib/market/types";
import { ageSeconds, cn, formatAge } from "@/lib/utils";

/**
 * Snapshot rebuilds cap how fast the board's contents can change, so polling
 * this endpoint faster than that is waste. Prices do not wait for it: they come
 * from the 1s tick stream and are overlaid on the rows.
 */
const POLL_MS = 6_000;
/** Arrivals are revealed one coin at a time, this far apart. */
const REVEAL_MS = 180;
/** A refresh that brings more than this many coins lands the rest at once. */
const MAX_QUEUE = 8;
/** How long an arrived coin keeps its glow. Matches the `row-arrive` keyframes. */
const FLASH_MS = 1_800;
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

type ColumnKey = keyof DiscoverColumns;

const COLUMNS: Array<{
  key: ColumnKey;
  title: string;
  /** Shown under the title in the column's own filter state. */
  hint: string;
  variant: TokenRowVariant;
  placeholder: string;
  emptyTitle: string;
  emptyDescription: string;
}> = [
  {
    key: "launches",
    title: "New pairs",
    hint: "Newest on the curve",
    variant: "launch",
    placeholder: "Search by ticker or name",
    emptyTitle: "No launches right now",
    emptyDescription:
      "Every token that hits the pump.fun curve shows up here the moment it launches.",
  },
  {
    key: "graduating",
    title: "Final stretch",
    hint: "Closest to filling the curve",
    variant: "graduating",
    placeholder: "Search by ticker or name",
    emptyTitle: "No coins near graduation",
    emptyDescription:
      "The window between 40% and 100% of the bonding curve is where moves get violent.",
  },
  {
    key: "trending",
    title: "Migrated",
    hint: "Graduated, ranked by flow",
    variant: "trending",
    placeholder: "Search by ticker or name",
    emptyTitle: "Nothing has migrated yet",
    emptyDescription:
      "Graduated coins ranked by the feed's trending score — mostly what just left the curve.",
  },
];

type Status = "live" | "reconnecting";

const EMPTY_QUERIES: Record<ColumnKey, string> = {
  launches: "",
  graduating: "",
  trending: "",
};

/** Prefer the fresh column, but never let a failed fetch empty a populated one. */
function keepIfEmpty(fresh: MarketToken[], current: MarketToken[]): MarketToken[] {
  return fresh.length > 0 ? fresh : current;
}

function mintsOf(snapshot: DiscoverSnapshot): Set<string> {
  const { launches, graduating, trending } = snapshot.columns;
  return new Set([...launches, ...graduating, ...trending].map((t) => t.mint));
}

export function DiscoverBoard({ initial }: { initial: DiscoverSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [status, setStatus] = useState<Status>("live");
  const [queries, setQueries] = useState<Record<ColumnKey, string>>(EMPTY_QUERIES);
  const [activeFilters, setActiveFilters] = useState<FilterId[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.generatedAt));
  // Coins that arrived in the latest refresh but are not on screen yet: they are
  // released one at a time so the board fills coin by coin, not in a batch.
  const [queue, setQueue] = useState<string[]>([]);
  // Coins currently glowing, and when they landed, so the flash can expire.
  const [arrived, setArrived] = useState<Map<string, number>>(() => new Map());
  const known = useRef(mintsOf(initial));

  // One batched request per second for every coin on the board.
  const liveMints = useMemo(
    () =>
      [
        ...snapshot.columns.launches,
        ...snapshot.columns.graduating,
        ...snapshot.columns.trending,
      ].map((token) => token.mint),
    [snapshot],
  );
  const livePrices = useLivePrices(liveMints);

  // Poll in the background, pausing while the tab is hidden.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      if (document.visibilityState === "hidden") return;

      try {
        // The query string is a cache buster: it keeps an intermediary from
        // answering with a board older than the one already on screen.
        const response = await fetch(
          `/api/market/discover?t=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const next = (await response.json()) as DiscoverSnapshot;
        if (cancelled) return;

        // A throttled upstream answers with empty columns. Replacing a good
        // board with that would blank the page every time the market feed
        // hiccups, so a column only shrinks to empty when the feed really has
        // nothing: otherwise the last good rows stay on screen.
        setSnapshot((current) =>
          next.generatedAt === current.generatedAt
            ? current
            : {
                ...next,
                columns: {
                  launches: keepIfEmpty(next.columns.launches, current.columns.launches),
                  graduating: keepIfEmpty(
                    next.columns.graduating,
                    current.columns.graduating,
                  ),
                  trending: keepIfEmpty(next.columns.trending, current.columns.trending),
                },
              },
        );

        const fresh = mintsOf(next);
        const newcomers = [...fresh].filter((mint) => !known.current.has(mint));
        known.current = fresh;
        if (newcomers.length > 0) {
          // Anything past the cap is dropped from the queue, which shows it
          // straight away — a long trickle is worse than one quick batch.
          setQueue((current) =>
            [...current, ...newcomers].slice(0, MAX_QUEUE),
          );
        }
        setStatus(next.degraded ? "reconnecting" : "live");
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

  // Release the queue one coin at a time — the reveal *is* the animation.
  useEffect(() => {
    if (queue.length === 0) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const mint = queue[0];

    const id = window.setTimeout(
      () => {
        setQueue((current) => current.slice(1));
        setArrived((current) => {
          const next = new Map(current);
          const at = Date.now();
          for (const [key, landed] of next) {
            if (at - landed > FLASH_MS) next.delete(key);
          }
          next.set(mint, at);
          return next;
        });
      },
      reduced ? 0 : REVEAL_MS,
    );

    return () => window.clearTimeout(id);
  }, [queue]);

  const toggleFilter = (id: FilterId) => {
    setActiveFilters((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  // Each column filters itself: its own search box, plus the shared chips.
  const visible = useMemo(() => {
    const match = (token: MarketToken, needle: string) => {
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

    const filterColumn = (key: ColumnKey) => {
      const needle = queries[key].trim().toLowerCase();
      return snapshot.columns[key].filter((token) => match(token, needle));
    };

    return {
      launches: filterColumn("launches"),
      graduating: filterColumn("graduating"),
      trending: filterColumn("trending"),
    } satisfies DiscoverColumns;
  }, [snapshot, queries, activeFilters, nowMs]);

  // Coins waiting their turn: they stay off the board until released.
  const queued = useMemo(() => new Set(queue), [queue]);

  const total =
    visible.launches.length +
    visible.graduating.length +
    visible.trending.length;
  const updated = formatAge(snapshot.generatedAt, nowMs);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-6 flex min-w-0 gap-1.5 overflow-x-auto px-6 lg:mx-0 lg:flex-1 lg:px-0">
          {FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.id);

            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFilter(filter.id)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[11px] font-semibold transition-colors",
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

        <div className="flex shrink-0 items-center gap-3 text-[10px] font-bold uppercase tracking-wide">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                status === "live" ? "bg-up" : "bg-gold",
              )}
            />
            {status === "live"
              ? `Live · ${updated} ago`
              : "Reconnecting"}
          </span>
          <span className="num text-muted/80">
            {snapshot.solPriceUsd
              ? `SOL $${snapshot.solPriceUsd.toFixed(2)} · `
              : ""}
            {total} coins
          </span>
        </div>
      </div>

      {/* One terminal panel, three columns, each with its own scroller. */}
      <div className="overflow-hidden rounded-[14px] border border-line bg-card">
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {COLUMNS.map((column) => {
            const all = visible[column.key];
            const rows = all.filter((token) => !queued.has(token.mint));
            const needle = queries[column.key].trim();
            const filtering = needle.length > 0 || activeFilters.length > 0;
            const isMintQuery = MINT_PATTERN.test(needle);

            return (
              <section
                key={column.key}
                className="flex min-w-0 flex-col"
              >
                <header className="flex items-center gap-2 border-b border-line bg-header px-2.5 py-2">
                  <div className="min-w-0 shrink-0">
                    <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink">
                      {column.title}
                    </h2>
                    <p className="num text-[9px] font-semibold text-muted/80">
                      {rows.length} · {column.hint}
                    </p>
                  </div>

                  <form
                    role="search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (isMintQuery) router.push(`/coin/${needle}`);
                    }}
                    className="relative min-w-0 flex-1"
                  >
                    <svg
                      className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                      type="search"
                      value={queries[column.key]}
                      onChange={(event) =>
                        setQueries((current) => ({
                          ...current,
                          [column.key]: event.target.value,
                        }))
                      }
                      placeholder={column.placeholder}
                      aria-label={`Search ${column.title}`}
                      className="h-7 w-full rounded-[7px] border border-line bg-bg pl-7 pr-2 text-[11px] text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/25"
                    />
                  </form>
                </header>

                <div className="board-column min-h-0 space-y-1 overflow-y-auto p-1.5">
                  {all.length > 0 ? (
                    rows.map((token, index) => (
                      <TokenRow
                        key={token.mint}
                        token={token}
                        variant={column.variant}
                        nowMs={nowMs}
                        livePrice={livePrices[token.mint]}
                        isNew={arrived.has(token.mint)}
                        enterDelayMs={index * 26}
                      />
                    ))
                  ) : (
                    <div className="flex h-full p-2">
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
                            ? "Clear the search or a filter to see the full board."
                            : snapshot.degraded
                              ? "The market feed didn't answer. The board retries in a few seconds."
                              : column.emptyDescription
                        }
                      />
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted/70">
        Prices, market caps and volumes come from the live Solana market and
        refresh in place every second. Curve % is an estimate from FDV and the
        current SOL price — exact fills land in the trading engine.
      </p>
    </div>
  );
}
