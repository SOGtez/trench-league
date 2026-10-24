import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leagues" };

const TABS = ["My leagues", "Public leagues", "Join by code"];

export default function LeaguesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leagues"
        subtitle="Run a paper-trading contest with friends, or play the calls ladder."
        actions={
          <Button
            disabled
            title="League creation unlocks with the league build"
          >
            Create league
          </Button>
        }
      />

      <div
        className="no-scrollbar -mx-6 flex gap-1 overflow-x-auto border-b border-line px-6"
        role="tablist"
        aria-label="League views"
      >
        {TABS.map((tab, index) => (
          <span
            key={tab}
            role="tab"
            aria-selected={index === 0}
            className={cn(
              "shrink-0 border-b-2 px-3.5 pb-3 pt-1 text-[13px] font-semibold",
              index === 0
                ? "border-brand text-ink"
                : "border-transparent text-muted",
            )}
          >
            {tab}
          </span>
        ))}
      </div>

      <Card className="p-5">
        <EmptyState
          title="You're not in a league yet"
          description="Paper leagues start everyone at the same balance and rank by % gain. Calls leagues rank by prediction points over a fixed window."
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-bold">Paper league</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Start with 5, 10, 25 or 100 paper SOL. Everybody trades the same
            coins with realistic fills. Highest portfolio value at the end wins.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-[14px] font-bold">Calls league</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            No trading. Pick the winning side of each round — correct picks earn
            points, streaks and contrarian picks earn bonuses.
          </p>
        </Card>
      </div>
    </div>
  );
}
