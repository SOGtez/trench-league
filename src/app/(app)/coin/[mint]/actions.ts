"use server";

import { revalidatePath } from "next/cache";

import { resolveActiveAccount } from "@/lib/leagues/active-account";
import { getTokenSnapshot } from "@/lib/market/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTradingConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { quoteTrade, QuoteError, type TradeSide } from "@/lib/trade/quote";

export type TradeState = {
  error: string | null;
  filled?: {
    side: TradeSide;
    symbol: string;
    solAmount: number;
    tokenAmount: number;
    impactPct: number;
    feeSol: number;
  };
};

const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const DB_ERRORS: Record<string, string> = {
  insufficient_balance: "Not enough paper SOL for that buy.",
  insufficient_tokens: "You don't hold that many tokens.",
  invalid_amount: "That amount is too small to fill.",
  account_not_owned: "That account isn't yours.",
  league_ended: "That league has ended — trading is closed.",
  invalid_account_type: "That account can't trade right now.",
};

export async function executeTrade(
  _previous: TradeState,
  formData: FormData,
): Promise<TradeState> {
  if (!isTradingConfigured()) {
    return { error: "Trading isn't configured yet — missing server credentials." };
  }

  const mint = String(formData.get("mint") ?? "").trim();
  const side = String(formData.get("side") ?? "") as TradeSide;
  const amount = Number(formData.get("amount") ?? 0);

  if (!MINT_PATTERN.test(mint)) {
    return { error: "That doesn't look like a token address." };
  }
  if (side !== "buy" && side !== "sell") {
    return { error: "Choose buy or sell." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter an amount first." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  // Practice or a league you're in — whichever the terminal is pointed at. The
  // resolver only ever returns accounts owned by this session's user.
  const account = await resolveActiveAccount(user.id);

  if (!account) {
    return { error: "No trading account found for this login." };
  }

  const snapshot = await getTokenSnapshot(mint);
  if (!snapshot) {
    return { error: "Couldn't get a live price for this coin — try again." };
  }

  let quote;
  try {
    quote = quoteTrade({
      token: snapshot.token,
      solPriceUsd: snapshot.solPriceUsd,
      side,
      solAmount: side === "buy" ? amount : undefined,
      tokenAmount: side === "sell" ? amount : undefined,
    });
  } catch (error) {
    if (error instanceof QuoteError) return { error: error.message };
    throw error;
  }

  const admin = createAdminClient();
  const { error: fillError } = await admin.rpc("execute_paper_trade", {
    p_user_id: user.id,
    p_account_id: account.id,
    p_mint: mint,
    p_symbol: snapshot.token.symbol,
    p_side: side,
    p_sol_amount: quote.solAmount,
    p_token_amount: quote.tokenAmount,
    p_price: quote.avgPriceSol,
    p_price_after: quote.priceAfterSol,
    p_impact: quote.impactPct,
    p_fees: quote.feeSol,
  });

  if (fillError) {
    const known = Object.keys(DB_ERRORS).find((key) =>
      fillError.message.includes(key),
    );
    return {
      error: known
        ? DB_ERRORS[known]
        : "The fill didn't go through. Try again.",
    };
  }

  revalidatePath("/", "layout");
  revalidatePath(`/coin/${mint}`);

  return {
    error: null,
    filled: {
      side,
      symbol: snapshot.token.symbol,
      solAmount: quote.solAmount,
      tokenAmount: quote.tokenAmount,
      impactPct: quote.impactPct,
      feeSol: quote.feeSol,
    },
  };
}
