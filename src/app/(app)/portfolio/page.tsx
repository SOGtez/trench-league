import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Portfolio" };

const STATS = [
  { label: "Win rate", value: "—" },
  { label: "Best trade", value: "—" },
  { label: "Worst trade", value: "—" },
  { label: "Avg hold", value: "—" },
  { label: "Fees paid", value: "0.00 SOL" },
];

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        subtitle="Practice account and per-league trading accounts."
        actions={
          <>
            <Link
              href="/discover"
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              Trade
            </Link>
            <Button
              variant="secondary"
              disabled
              title="Practice resets unlock with the trading engine"
            >
              Reset practice
            </Button>
          </>
        }
      />

      <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
        <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-active px-3.5 text-[12px] font-bold text-ink">
          Practice account
        </span>
        <span className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3.5 text-[12px] font-semibold text-muted">
          League accounts appear here once you join one
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[14px] border border-line bg-card px-4 py-3.5"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {stat.label}
            </p>
            <p className="num mt-1 text-[15px] font-bold text-ink">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="Open positions" subtitle="Live value and unrealised P/L." />
        <div className="p-5">
          <EmptyState
            title="No open positions"
            description="Buy a token on Discover and it will show up here with live P/L."
            action={
              <Link
                href="/discover"
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                Find a coin
              </Link>
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Trade history" subtitle="Every fill, with impact and fees." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wider text-muted">
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Token</th>
                <th className="px-5 py-3">Side</th>
                <th className="px-5 py-3 text-right">SOL</th>
                <th className="px-5 py-3 text-right">Price</th>
                <th className="px-5 py-3 text-right">Impact</th>
                <th className="px-5 py-3 text-right">Fees</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[13px] text-muted">
                  No trades yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <p className={cn("text-[12px] text-muted")}>
        All balances are paper SOL. Nothing here touches a real wallet.
      </p>
    </div>
  );
}
