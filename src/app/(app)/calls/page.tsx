import type { Metadata } from "next";

import { CallsBoard } from "@/components/calls/calls-board";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getAuthContext } from "@/lib/auth";
import { getCallsView } from "@/lib/calls/queries";

export const metadata: Metadata = { title: "Calls" };

// Calls are scored from live prices: never bake a round into the build.
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const ctx = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calls"
        subtitle="Pick the next move. Correct calls earn points — streaks and contrarian picks earn more."
      />

      {ctx ? (
        <CallsBoard initial={await getCallsView(ctx.user.id)} />
      ) : (
        <EmptyState
          title="Sign in to make calls"
          description="Calls are scored per player, so you need an account to pick a side."
        />
      )}
    </div>
  );
}
