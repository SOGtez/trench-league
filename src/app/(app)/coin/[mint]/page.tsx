import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PaperLabel } from "@/components/paper-label";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { shortAddress } from "@/lib/utils";

type CoinPageProps = { params: Promise<{ mint: string }> };

export async function generateMetadata({
  params,
}: CoinPageProps): Promise<Metadata> {
  const { mint } = await params;
  return { title: shortAddress(mint, 4) };
}

export default async function CoinPage({ params }: CoinPageProps) {
  const { mint } = await params;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/discover"
          aria-label="Back to Discover"
          className="grid size-11 place-items-center rounded-[12px] border border-line bg-card text-soft transition-colors hover:bg-hover"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Coin
          </p>
          <h1 className="num truncate text-[20px] font-extrabold tracking-tight">
            {shortAddress(mint, 6)}
          </h1>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="flex min-h-[520px] flex-col">
          <CardHeader
            title="Chart"
            subtitle="1s · 15s · 1m · 5m candles"
          />
          <div className="flex flex-1 flex-col p-5">
            <EmptyState
              title="Price feed not connected"
              description="Candles, live trades, holders and stats appear here once the market data layer is live."
              className="flex-1"
            />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Trade" subtitle="Fake SOL in, fake tokens out." />
          <div className="flex flex-1 flex-col p-5">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-line bg-header p-1">
              <span className="rounded-full bg-up px-3 py-1.5 text-center text-[13px] font-bold text-[#04140d]">
                Buy
              </span>
              <span className="px-3 py-1.5 text-center text-[13px] font-semibold text-muted">
                Sell
              </span>
            </div>

            <EmptyState
              title="Trading engine not wired yet"
              description="Quotes, price impact, fees and fills are calculated server-side in the next build phase."
            />

            <div className="mt-5">
              <button
                type="button"
                disabled
                className={buttonStyles({
                  variant: "buy",
                  size: "lg",
                  className: "w-full",
                })}
              >
                Buy 0.5 SOL
              </button>
              <div className="mt-3 flex justify-center">
                <PaperLabel />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
