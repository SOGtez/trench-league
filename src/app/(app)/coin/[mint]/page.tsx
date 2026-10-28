import type { Metadata } from "next";
import Link from "next/link";

import { CoinTerminal, type LedgerRow } from "@/components/coin/coin-terminal";
import type { ChartFill } from "@/components/coin/price-chart";
import type { PositionStats } from "@/components/coin/trade-panel";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth";
import { getTokenSnapshot } from "@/lib/market/token";
import { createClient } from "@/lib/supabase/server";
import { priorityFeeSol, swapFeeBps } from "@/lib/trade/quote";
import { shortAddress } from "@/lib/utils";

type CoinPageProps = { params: Promise<{ mint: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: CoinPageProps): Promise<Metadata> {
  const { mint } = await params;
  const snapshot = await getTokenSnapshot(mint);
  return { title: snapshot ? `${snapshot.token.symbol}` : shortAddress(mint, 4) };
}

export default async function CoinPage({ params }: CoinPageProps) {
  const { mint } = await params;
  const [snapshot, ctx] = await Promise.all([
    getTokenSnapshot(mint),
    getAuthContext(),
  ]);

  if (!snapshot) {
    return (
      <div className="space-y-5">
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
        >
          ← Discover
        </Link>
        <Card className="p-8 text-center">
          <h1 className="text-[18px] font-bold">No live market for this mint</h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13px] text-muted">
            It may not have a trading pool yet, or the address is wrong. New
            launches appear on Discover the moment they hit the curve.
          </p>
          <div className="mt-5 flex justify-center">
            <Link
              href="/discover"
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              Back to Discover
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const { token, solPriceUsd } = snapshot;

  // Position and balance always describe the active account, so the panel can
  // never show practice money while a league fill is what executes.
  const account = ctx?.active ?? null;

  let position = { tokens: 0, costSol: 0 };
  let positionStats: PositionStats = {
    investedSol: 0,
    soldSol: 0,
    remainingSol: 0,
    pnlSol: 0,
    pnlPct: 0,
  };
  let chartFills: ChartFill[] = [];
  let ledger: LedgerRow[] = [];
  let investedSol = 0;
  let soldSol = 0;

  if (account) {
    const supabase = await createClient();
    const [positionResult, tradesResult] = await Promise.all([
      supabase
        .from("positions")
        .select("token_amount, cost_basis_sol")
        .eq("account_id", account.id)
        .eq("token_mint", mint)
        .maybeSingle<{ token_amount: string; cost_basis_sol: string }>(),
      supabase
        .from("trades")
        .select("side, sol_amount, price, created_at")
        .eq("account_id", account.id)
        .eq("token_mint", mint)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

    if (positionResult.data) {
      position = {
        tokens: Number(positionResult.data.token_amount),
        costSol: Number(positionResult.data.cost_basis_sol),
      };
    }

    const rows =
      (tradesResult.data as
        | { side: "buy" | "sell"; sol_amount: string; price: string; created_at: string }[]
        | null) ?? [];

    for (const row of rows) {
      const solAmount = Number(row.sol_amount);
      if (!Number.isFinite(solAmount)) continue;

      if (row.side === "buy") investedSol += solAmount;
      else soldSol += solAmount;
    }

    const priceSol =
      token.priceUsd && solPriceUsd ? token.priceUsd / solPriceUsd : null;

    const parsed = rows
      .map((row) => {
        const solAmount = Number(row.sol_amount);
        const price = Number(row.price);
        const time = Math.round(Date.parse(row.created_at) / 1_000);

        return {
          time,
          side: row.side,
          solAmount,
          // Fills store SOL per token; the blotter shows what was actually
          // bought or sold, so the size is derived from the price paid.
          tokenAmount:
            Number.isFinite(price) && price > 0 ? solAmount / price : 0,
        } satisfies LedgerRow;
      })
      .filter((row) => Number.isFinite(row.time) && row.time > 0);

    chartFills = parsed
      .slice(-40)
      .map((row) => ({
        time: row.time,
        side: row.side,
        solAmount: row.solAmount,
      }));

    // Newest first for the table; the chart wants them oldest first.
    ledger = [...parsed].reverse();

    if (investedSol > 0) {
      // Fills exist: the true round trip is what came back plus what is still
      // held, minus everything that went in.
      positionStats = {
        investedSol,
        soldSol,
        remainingSol: priceSol ? position.tokens * priceSol : 0,
        pnlSol: 0,
        pnlPct: 0,
      };
      positionStats.pnlSol =
        positionStats.remainingSol + soldSol - investedSol;
      positionStats.pnlPct = (positionStats.pnlSol / investedSol) * 100;
    }
  }

  const avgEntryPriceUsd =
    position.tokens > 0 && solPriceUsd
      ? (position.costSol / position.tokens) * solPriceUsd
      : null;

  return (
    // The app shell pads every page; a terminal wants the whole frame, so the
    // page reclaims that padding and fills the height under the header.
    <div className="-mx-6 -my-8">
      <CoinTerminal
        token={token}
        solPriceUsd={solPriceUsd}
        avgEntryPriceUsd={avgEntryPriceUsd}
        chartFills={chartFills}
        ledger={ledger}
        position={position}
        positionStats={positionStats}
        solBalance={account?.solBalance ?? 0}
        accounts={ctx?.accounts ?? []}
        activeAccountId={account?.id ?? null}
        feeBps={swapFeeBps()}
        priorityFeeSol={priorityFeeSol()}
      />
    </div>
  );
}
