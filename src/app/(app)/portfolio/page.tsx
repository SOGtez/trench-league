import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth";
import { getLivePrices } from "@/lib/market/prices";
import { getSolPriceUsd } from "@/lib/market/sol";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  formatPct,
  formatSol,
  formatSolAmount,
  formatTokenAmount,
  formatUsdPrice,
  shortAddress,
  toneForPnl,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Portfolio" };

export const dynamic = "force-dynamic";

type PositionRow = {
  token_mint: string;
  token_amount: string;
  avg_entry_price: string;
  cost_basis_sol: string;
};

type TradeRow = {
  id: string;
  token_mint: string;
  side: "buy" | "sell";
  sol_amount: string;
  token_amount: string;
  price: string;
  price_impact: string;
  fees: string;
  created_at: string;
};

export default async function PortfolioPage() {
  const ctx = await getAuthContext();

  if (!ctx?.practice) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Portfolio"
          subtitle="Practice account and per-league trading accounts."
        />
        <Card>
          <div className="p-8">
            <EmptyState
              title="No practice account yet"
              description="Sign in to get a practice account with paper SOL and start trading."
            />
          </div>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const accountId = ctx.practice.id;

  const [positionsResult, tradesResult] = await Promise.all([
    supabase
      .from("positions")
      .select("token_mint, token_amount, avg_entry_price, cost_basis_sol")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("trades")
      .select(
        "id, token_mint, side, sol_amount, token_amount, price, price_impact, fees, created_at",
        { count: "exact" },
      )
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const positions = (positionsResult.data ?? []) as PositionRow[];
  const trades = (tradesResult.data ?? []) as TradeRow[];
  const tradeCount = tradesResult.count ?? trades.length;

  const mints = [...new Set([...positions, ...trades].map((row) => row.token_mint))];

  const [prices, solPrice, tokenRows] = await Promise.all([
    getLivePrices(positions.map((row) => row.token_mint)),
    getSolPriceUsd(),
    mints.length > 0
      ? supabase.from("tokens").select("mint, ticker").in("mint", mints)
      : Promise.resolve({ data: [] as { mint: string; ticker: string | null }[] }),
  ]);

  const symbols = new Map<string, string>(
    (tokenRows.data ?? []).map((row) => [row.mint, row.ticker ?? shortAddress(row.mint, 4)]),
  );
  const symbolFor = (mint: string) => symbols.get(mint) ?? shortAddress(mint, 4);

  const valued = positions.map((position) => {
    const live = prices[position.token_mint]?.priceUsd ?? null;
    const tokens = Number(position.token_amount);
    const cost = Number(position.cost_basis_sol);
    const value = live && solPrice ? (tokens * live) / solPrice : null;
    const pnl = value !== null ? value - cost : null;
    const pnlPct = cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;

    return {
      mint: position.token_mint,
      symbol: symbolFor(position.token_mint),
      tokens,
      avgEntry: Number(position.avg_entry_price),
      cost,
      livePrice: live,
      value,
      pnl,
      pnlPct,
    };
  });

  const positionsValue = valued.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const cash = ctx.practice.sol_balance;
  const accountValue = positionsValue + cash;
  const starting = ctx.practice.starting_balance || 10;
  const totalPnl = accountValue - starting;
  const totalPnlPct = starting > 0 ? (totalPnl / starting) * 100 : 0;
  const feesPaid = trades.reduce((sum, trade) => sum + Number(trade.fees), 0);

  const stats = [
    { label: "Account value", value: `${formatSolAmount(accountValue)} SOL` },
    {
      label: "All-time P/L",
      value: `${totalPnl >= 0 ? "+" : ""}${formatSolAmount(totalPnl)} SOL`,
      tone: toneForPnl(totalPnl),
      sub: formatPct(totalPnlPct),
    },
    { label: "Cash", value: `${formatSolAmount(cash)} SOL` },
    { label: "Positions", value: `${formatSolAmount(positionsValue)} SOL` },
    { label: "Trades", value: String(tradeCount) },
    { label: "Fees paid", value: `${formatSolAmount(feesPaid)} SOL` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        subtitle="Practice account. Live prices, paper SOL."
        actions={
          <Link
            href="/discover"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Trade
          </Link>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[14px] border border-line bg-card px-4 py-3.5"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {stat.label}
            </p>
            <p
              className={cn(
                "num mt-1 text-[15px] font-bold",
                stat.tone ?? "text-ink",
              )}
            >
              {stat.value}
            </p>
            {stat.sub ? (
              <p className={cn("num mt-0.5 text-[11px]", stat.tone)}>
                {stat.sub}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Open positions"
          subtitle="Marked to the live pool price."
        />
        {valued.length === 0 ? (
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Token</th>
                  <th className="px-5 py-3 text-right">Holding</th>
                  <th className="px-5 py-3 text-right">Avg entry</th>
                  <th className="px-5 py-3 text-right">Live price</th>
                  <th className="px-5 py-3 text-right">Value</th>
                  <th className="px-5 py-3 text-right">P/L</th>
                </tr>
              </thead>
              <tbody>
                {valued.map((row) => (
                  <tr
                    key={row.mint}
                    className="border-b border-line/60 last:border-0 hover:bg-hover/40"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/coin/${row.mint}`}
                        className="text-[13px] font-bold text-ink hover:text-link"
                      >
                        {row.symbol}
                      </Link>
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-soft">
                      {formatTokenAmount(row.tokens)}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-muted">
                      {formatUsdPrice(row.avgEntry * (solPrice ?? 0))}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-soft">
                      {formatUsdPrice(row.livePrice)}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] font-semibold text-ink">
                      {row.value !== null ? `${formatSolAmount(row.value)} SOL` : "—"}
                    </td>
                    <td
                      className={cn(
                        "num px-5 py-3 text-right text-[12px] font-semibold",
                        toneForPnl(row.pnl),
                      )}
                    >
                      {row.pnl !== null
                        ? `${row.pnl >= 0 ? "+" : ""}${formatSolAmount(row.pnl)} SOL`
                        : "—"}
                      {row.pnlPct !== null ? (
                        <span className="ml-1 text-[11px] text-muted">
                          ({formatPct(row.pnlPct)})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Trade history" subtitle="Every fill, with impact and fees." />
        {trades.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No trades yet"
              description="Your fills will appear here the moment you trade."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Token</th>
                  <th className="px-5 py-3">Side</th>
                  <th className="px-5 py-3 text-right">SOL</th>
                  <th className="px-5 py-3 text-right">Tokens</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-right">Impact</th>
                  <th className="px-5 py-3 text-right">Fees</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-line/60 last:border-0 hover:bg-hover/40"
                  >
                    <td className="num px-5 py-3 text-[12px] text-muted">
                      {new Date(trade.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/coin/${trade.token_mint}`}
                        className="text-[12px] font-semibold text-ink hover:text-link"
                      >
                        {symbolFor(trade.token_mint)}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          trade.side === "buy"
                            ? "bg-up/15 text-up"
                            : "bg-down/15 text-down",
                        )}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-soft">
                      {formatSol(Number(trade.sol_amount))}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-muted">
                      {formatTokenAmount(Number(trade.token_amount))}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-muted">
                      {formatUsdPrice(Number(trade.price) * (solPrice ?? 0))}
                    </td>
                    <td
                      className={cn(
                        "num px-5 py-3 text-right text-[12px]",
                        Math.abs(Number(trade.price_impact)) > 0.05
                          ? "text-down"
                          : "text-muted",
                      )}
                    >
                      {formatPct(Number(trade.price_impact) * 100, 2)}
                    </td>
                    <td className="num px-5 py-3 text-right text-[12px] text-muted">
                      {formatSolAmount(Number(trade.fees))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[12px] text-muted">
        All balances are paper SOL. Nothing here touches a real wallet.
      </p>
    </div>
  );
}
