import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Calls" };

export default function CallsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Calls"
        subtitle="Pick the next move. Correct calls earn points — streaks and contrarian picks earn more."
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-[420px]">
        <div className="rounded-[14px] border border-line bg-card px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Current streak
          </p>
          <p className="num mt-1 text-[18px] font-bold">0</p>
        </div>
        <div className="rounded-[14px] border border-line bg-card px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Total points
          </p>
          <p className="num mt-1 text-[18px] font-bold">0</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="This round"
          subtitle="One up/down call plus one head-to-head each round."
        />
        <div className="p-5">
          <EmptyState
            title="No open calls"
            description="The next round opens shortly. Pick a side before the lock time to be scored."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Past calls" subtitle="Your results, newest first." />
        <div className="p-5">
          <EmptyState title="No resolved calls yet" />
        </div>
      </Card>
    </div>
  );
}
