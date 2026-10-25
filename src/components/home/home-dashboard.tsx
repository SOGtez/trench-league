import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PaperLabel } from "@/components/paper-label";
import { TokenAvatar } from "@/components/discover/token-avatar";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { displayName, type AuthContext } from "@/lib/auth";
import { getLivePrices } from "@/lib/market/prices";
import { getSolPriceUsd } from "@/lib/market/sol";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  formatPct,
  formatSol,
  formatSolAmount,
  formatTokenAmount,
  shortAddress,
  toneForPnl,
} from "@/lib/utils";

type PositionRow = {
  token_mint: string;
  token_amount: string;
  avg_entry_price: string;
  cost_basis_sol: string;
};

type TradeRow = {
  side: "buy" | "sell";
  sol_amount: string;
  fees: string;
  created_at: string;
};

/** How many fills the cash-history line is built from. */
const HISTORY_LIMIT = 500;

export async function HomeDashboard({ ctx }: { ctx: AuthContext }) {
  const name = displayName(ctx);
  const account = ctx.active;

  const starting =
    account?.startingBalance || ctx.practice?.starting_balance || 10;
  const cash = account?.solBalance ?? ctx.practice?.sol_balance ?? 0;
  const accountId = account?.id ?? ctx.practice?.id ?? null;
  const accountLabel = account?.label ?? "Practice";

  const supabase = await createClient();

  const [positionsResult, tradesResult] = accountId
    ? await Promise.all([
        supabase
          .from("positions")
          .select("token_mint, token_amount, avg_entry_price, cost_basis_sol")
          .eq("account_id", accountId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("trades")
          .select("side, sol_amount, fees, created_at", { count: "exact" })
          .eq("account_id", accountId)
          .order("created_at", { ascending: true })
          .limit(HISTORY_LIMIT),
      ])
    : [{ data: [] as PositionRow[] }, { data: [] as TradeRow[], count: 0 }];

  const positions = (positionsResult.data ?? []) as PositionRow[];
  const trades = (tradesResult.data ?? []) as TradeRow[];
  const tradeCount = tradesResult.count ?? trades.length;

  const mints = positions.map((row) => row.token_mint);
  const [prices, solPrice, tokenRows] = await Promise.all([
    getLivePrices(mints),
    getSolPriceUsd(),
    mints.length > 0
      ? supabase.from("tokens").select("mint, ticker").in("mint", mints)
      : Promise.resolve({ data: [] as { mint: string; ticker: string | null }[] }),
  ]);

  const symbols = new Map<string, string>(
    (tokenRows.data ?? []).map((row) => [
      row.mint,
      row.ticker ?? shortAddress(row.mint, 4),
    ]),
  );
  const symbolFor = (mint: string) =>
    symbols.get(mint) ?? shortAddress(mint, 4);

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
      cost,
      value,
      pnl,
      pnlPct,
    };
  });

  const positionsValue = valued.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const accountValue = cash + positionsValue;
  const gainSol = accountValue - starting;
  const gainPct = starting > 0 ? (gainSol / starting) * 100 : 0;

  const feesPaid = trades.reduce((sum, trade) => sum + Number(trade.fees), 0);

  // Cash after every fill, replayed from the starting balance. Open positions
  // are marked separately, so this tracks paper SOL leaving and re-entering the
  // account rather than pretending to be a full equity curve.
  const cashSeries: number[] = [starting];
  let running = starting;
  for (const trade of trades) {
    running +=
      trade.side === "buy"
        ? -Number(trade.sol_amount)
        : Number(trade.sol_amount);
    cashSeries.push(running);
  }
  const fillCount = cashSeries.length - 1;

  const openValue = valued
    .filter((row) => row.tokens > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const leagueAccounts = ctx.accounts.filter((entry) => entry.type === "league");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Home
          </p>
          <h1 className="mt-1 truncate text-[26px] font-extrabold tracking-tight">
            gm, {name}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Fake SOL, live prices. Let&apos;s see if you have the eye.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/discover" className={buttonStyles({ size: "md" })}>
            Start trading
          </Link>
          <Link
            href="/leagues"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Join league
          </Link>
          <Link
            href="/leagues"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Create league
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      {accountLabel} account
                    </span>
                    <Pill tone="brand">Paper</Pill>
                  </div>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="num text-[34px] font-bold leading-none">
                      {formatSol(cash)}
                    </span>
                    <span className="text-[13px] font-semibold text-muted">
                      SOL cash
                    </span>
                  </div>

                  <p
                    className={cn(
                      "mt-2 text-[13px] font-semibold",
                      toneForPnl(gainPct),
                    )}
                  >
                    {formatPct(gainPct, 2)} all-time ·{" "}
                    <span className="num">
                      {gainSol >= 0 ? "+" : ""}
                      {formatSolAmount(gainSol)} SOL
                    </span>{" "}
                    <span className="font-normal text-muted">
                      incl. {formatSolAmount(positionsValue)} SOL in positions
                    </span>
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Account value
                  </p>
                  <p className="num mt-0.5 text-[18px] font-bold text-ink">
                    {formatSolAmount(accountValue)} SOL
                  </p>
                </div>
              </div>

              {fillCount > 0 ? (
                <div className="mt-5 rounded-[12px] border border-line bg-bg/40 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Cash balance
                    </span>
                    <span className="num text-[11px] text-muted">
                      {fillCount} {fillCount === 1 ? "fill" : "fills"} · started
                      with {formatSol(starting)} SOL
                    </span>
                  </div>
                  <CashLine points={cashSeries} baseline={starting} />
                </div>
              ) : (
                <div className="mt-5 grid h-[140px] place-items-center rounded-[12px] border border-dashed border-line bg-bg/40 px-6 text-center">
                  <p className="text-[13px] text-muted">
                    Cash history starts after your first trade.
                  </p>
                </div>
              )}

              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Trades" value={String(tradeCount)} />
                <Stat label="Open positions" value={String(openValue.length)} />
                <Stat
                  label="Fees paid"
                  value={`${formatSolAmount(feesPaid)} SOL`}
                />
                <Stat label="Cash" value={`${formatSolAmount(cash)} SOL`} />
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Your leagues"
              subtitle="Paper and calls leagues you've joined."
              action={
                <Link
                  href="/leagues"
                  className="text-[12px] font-semibold text-link hover:underline"
                >
                  Browse
                </Link>
              }
            />
            <div className="p-5">
              {leagueAccounts.length === 0 ? (
                <EmptyState
                  title="No leagues yet"
                  description="Create a league with your friends or join a public one. Paper leagues rank by % gain; calls leagues rank by points."
                  action={
                    <Link
                      href="/leagues"
                      className={buttonStyles({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Browse leagues
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {leagueAccounts.map((entry) => {
                    const gain = entry.solBalance - entry.startingBalance;
                    const pct =
                      entry.startingBalance > 0
                        ? (gain / entry.startingBalance) * 100
                        : 0;

                    return (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-header px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-ink">
                            {entry.label}
                          </p>
                          <p className="num text-[11px] text-muted">
                            {formatSolAmount(entry.solBalance)} SOL
                          </p>
                        </div>
                        <span
                          className={cn(
                            "num text-[12px] font-semibold",
                            toneForPnl(pct),
                          )}
                        >
                          {formatPct(pct)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader
              title="Today's call"
              action={
                <Link
                  href="/calls"
                  className="text-[12px] font-semibold text-link hover:underline"
                >
                  All calls
                </Link>
              }
            />
            <div className="p-5">
              <EmptyState
                title="No call is open"
                description="A new up/down call drops each weekday. Pick a side before the lock to earn points."
              />
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
                <span className="text-[12px] font-semibold text-muted">
                  Current streak
                </span>
                <span className="num text-[13px] font-bold text-soft">
                  {ctx.profile?.streak_current ?? 0}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Open positions"
              action={
                <Link
                  href="/portfolio"
                  className="text-[12px] font-semibold text-link hover:underline"
                >
                  All
                </Link>
              }
            />
            <div className="p-5">
              {openValue.length === 0 ? (
                <>
                  <EmptyState
                    title="Nothing open"
                    description="Tokens you're holding will show live P/L here."
                    action={
                      <Link
                        href="/discover"
                        className={buttonStyles({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Find a coin
                      </Link>
                    }
                  />
                  <div className="mt-4">
                    <PaperLabel />
                  </div>
                </>
              ) : (
                <>
                  <ul className="space-y-2.5">
                    {openValue.slice(0, 4).map((row) => (
                      <li key={row.mint}>
                        <Link
                          href={`/coin/${row.mint}`}
                          className="flex items-center gap-3 rounded-[12px] border border-line bg-header px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-hover"
                        >
                          <TokenAvatar
                            mint={row.mint}
                            symbol={row.symbol}
                            className="size-8 text-[10px]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-bold text-ink">
                              {row.symbol}
                            </p>
                            <p className="num text-[11px] text-muted">
                              {formatTokenAmount(row.tokens)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="num text-[12px] font-semibold text-ink">
                              {row.value !== null
                                ? `${formatSolAmount(row.value)} SOL`
                                : "—"}
                            </p>
                            <p
                              className={cn(
                                "num text-[11px] font-semibold",
                                toneForPnl(row.pnl),
                              )}
                            >
                              {row.pnl !== null
                                ? `${row.pnl >= 0 ? "+" : ""}${formatSolAmount(row.pnl)} SOL`
                                : "—"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5 text-[12px] text-muted">
                    <span className="font-semibold">Marked value</span>
                    <span className="num font-bold text-ink">
                      {formatSolAmount(positionsValue)} SOL
                    </span>
                  </div>
                  <div className="mt-3">
                    <PaperLabel />
                  </div>
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-header px-3.5 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="num mt-1 text-[15px] font-bold text-ink">{value}</dd>
    </div>
  );
}

/** Cash balance over the trade history, with the starting balance as baseline. */
function CashLine({ points, baseline }: { points: number[]; baseline: number }) {
  const width = 320;
  const height = 110;
  const pad = 8;

  const all = [...points, baseline];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const last = points[points.length - 1] ?? baseline;
  const up = last >= baseline;

  const x = (index: number) =>
    pad +
    (points.length === 1
      ? (width - pad * 2) / 2
      : (index / (points.length - 1)) * (width - pad * 2));
  const y = (value: number) =>
    pad + (1 - (value - min) / span) * (height - pad * 2);

  const line = points
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  return (
    <div className={cn("mt-2 h-[110px] w-full", up ? "text-up" : "text-down")}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill="currentColor" fillOpacity={0.12} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
