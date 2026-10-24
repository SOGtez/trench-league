import type { Metadata } from "next";

import { DiscoverBoard } from "@/components/discover/discover-board";
import { PageHeader } from "@/components/page-header";
import { PaperLabel } from "@/components/paper-label";
import { getDiscoverSnapshot } from "@/lib/market/discover";

export const metadata: Metadata = { title: "Discover" };

// The board is live data: never bake a snapshot into the build.
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const snapshot = await getDiscoverSnapshot();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Discover"
        subtitle="Live pump.fun launches and graduated Solana memecoins. Pick a coin to open its terminal."
        actions={
          <>
            <span className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Quick buy
              </span>
              <span className="num text-[13px] font-bold text-ink">0.5 SOL</span>
            </span>
            <PaperLabel className="hidden sm:inline-flex" />
          </>
        }
      />

      <DiscoverBoard initial={snapshot} />
    </div>
  );
}
