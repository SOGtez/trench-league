import type { Metadata } from "next";
import Link from "next/link";

import { PriceChart } from "@/components/coin/price-chart";
import { TradePanel } from "@/components/coin/trade-panel";
import { TokenAvatar } from "@/components/discover/token-avatar";
import { PaperLabel } from "@/components/paper-label";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { getAuthContext } from "@/lib/auth";
import { getTokenSnapshot } from "@/lib/market/token";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  formatAge,
  formatCompactUsd,
  formatPct,
  formatTokenAmount,
  formatUsdPrice,
  shortAddress,
  toneForPnl,
} from "@/lib/utils";

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
        <BackLink />
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
  if (account) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("positions")
      .select("token_amount, cost_basis_sol")
      .eq("account_id", account.id)
      .eq("token_mint", mint)
      .maybeSingle<{ token_amount: string; cost_basis_sol: string }>();

    if (data) {
      position = {
        tokens: Number(data.token_amount),
        costSol: Number(data.cost_basis_sol),
      };
    }
  }

  const changeTone = toneForPnl(token.change1hPct);

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <TokenAvatar
            mint={token.mint}
            symbol={token.symbol}
            logoUrl={token.logoUrl}
            className="size-11 text-[13px]"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-extrabold tracking-tight">
                {token.symbol}
              </h1>
              <Pill tone={token.graduated ? "brand" : "gold"}>
                {token.graduated ? "graduated" : "on curve"}
              </Pill>
            </div>
            <p className="num mt-0.5 text-[12px] text-muted">
              {token.dex} · {formatAge(token.createdAt)} old ·{" "}
              {shortAddress(token.mint, 4)}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="num text-[26px] font-bold leading-none">
            {formatUsdPrice(token.priceUsd)}
          </p>
          <p className={cn("num mt-1.5 text-[13px] font-semibold", changeTone)}>
            {formatPct(token.change1hPct)} · 1h
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="FDV" value={formatCompactUsd(token.fdvUsd)} />
        <Stat label="Liquidity" value={formatCompactUsd(token.liquidityUsd)} />
        <Stat label="24h volume" value={formatCompactUsd(token.volume24hUsd)} />
        <Stat label="1h buys" value={String(token.buys1h)} tone="up" />
        <Stat label="1h sells" value={String(token.sells1h)} tone="down" />
        <Stat
          label={token.graduated ? "Status" : "To graduation"}
          value={
            token.curveProgressPct !== null
              ? `${Math.round(token.curveProgressPct)}%`
              : "Graduated"
          }
        />
      </div>

      {token.curveProgressPct !== null ? (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className={cn(
                "h-full rounded-full",
                token.curveProgressPct >= 90
                  ? "bg-gold"
                  : token.curveProgressPct >= 70
                    ? "bg-up"
                    : "bg-brand",
              )}
              style={{ width: `${Math.max(2, Math.round(token.curveProgressPct))}%` }}
            />
          </div>
          <span className="num shrink-0 text-[11px] font-bold text-muted">
            bonding curve
          </span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-w-0 flex-col overflow-hidden">
          <CardHeader
            title="Chart"
            subtitle="Live candles from the pool. Refreshes every 20s."
          />
          <PriceChart mint={token.mint} />
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Trade"
            subtitle="Fake SOL in, fake tokens out."
          />
          <div className="flex flex-1 flex-col p-5">
            <TradePanel
              mint={token.mint}
              symbol={token.symbol}
              solBalance={account?.solBalance ?? 0}
              positionTokens={position.tokens}
              positionCostSol={position.costSol}
              priceUsd={token.priceUsd}
              solPriceUsd={solPriceUsd}
              accounts={ctx?.accounts ?? []}
              activeAccountId={account?.id ?? null}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title="Market"
            subtitle="Everything the terminal knows about this coin."
          />
          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
            <Detail label="Symbol" value={token.symbol} />
            <Detail label="Mint" value={shortAddress(token.mint, 6)} />
            <Detail label="DEX" value={token.dex} />
            <Detail
              label="Liquidity"
              value={formatCompactUsd(token.liquidityUsd)}
            />
            <Detail
              label="Holders"
              value="—"
              hint="Holder data lands with the Helius feed."
            />
            <Detail
              label="Your holdings"
              value={`${formatTokenAmount(position.tokens)} ${token.symbol}`}
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Paper only" subtitle="What this page does and doesn't do." />
          <div className="space-y-2.5 p-5 text-[12px] leading-relaxed text-muted">
            <p>
              Fills are priced off the live pool with a constant-product model,
              so big orders move the price — exactly like a real swap.
            </p>
            <p>
              Fees are 1% plus a flat priority fee on every fill. Balances are
              paper SOL; no wallet, no real money.
            </p>
            <PaperLabel className="pt-1" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/discover"
      className="inline-flex items-center gap-2 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      Discover
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-[14px] border border-line bg-card px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={cn(
          "num mt-1 text-[15px] font-bold",
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="num mt-1 truncate text-[13px] font-semibold text-soft">
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[11px] text-muted/70">{hint}</p> : null}
    </div>
  );
}
