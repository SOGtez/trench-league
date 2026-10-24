import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Discover" };

const FILTERS = ["Age < 1h", "MC > $20K", "Holders 100+", "Dev < 10%"];

const COLUMNS = [
  {
    title: "New launches",
    subtitle: "Live, newest first",
    empty: "Waiting on the live pump.fun launch feed.",
    description:
      "Every new token that hits the curve appears here the moment it launches.",
  },
  {
    title: "About to graduate",
    subtitle: "Bonding curve 70%+",
    empty: "No coins near graduation yet.",
    description:
      "Coins close to filling their bonding curve — the window where moves get violent.",
  },
  {
    title: "Trending",
    subtitle: "Graduated, ranked by 1h volume",
    empty: "Trending list is empty.",
    description:
      "Graduated coins sorted by the last hour of trading volume.",
  },
];

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        subtitle="Live pump.fun launches and graduated Solana memecoins."
        actions={
          <span className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Quick buy
            </span>
            <span className="num text-[13px] font-bold text-ink">0.5 SOL</span>
          </span>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-[420px]">
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
            placeholder="Name, ticker, or paste a contract address"
            aria-label="Search tokens"
            className="h-11 w-full rounded-[12px] border border-line bg-card pl-10 pr-3.5 text-[13px] text-ink placeholder:text-muted/70 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 lg:mx-0 lg:px-0">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full border border-line bg-card px-3.5 text-[12px] font-semibold text-soft transition-colors hover:border-line-strong hover:bg-hover",
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => (
          <Card key={column.title} className="flex min-w-0 flex-col">
            <CardHeader title={column.title} subtitle={column.subtitle} />
            <div className="flex flex-1 flex-col p-4">
              <EmptyState
                title={column.empty}
                description={column.description}
                className="flex-1"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
