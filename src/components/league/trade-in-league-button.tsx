"use client";

import { useActionState } from "react";

import { tradeInLeague, type SwitchState } from "@/app/(app)/leagues/actions";
import { Button } from "@/components/ui/button";

const initialState: SwitchState = { error: null };

/**
 * Switches the terminal into this league's account and sends you to Discover.
 * The redirect happens server-side, so the whole league context moves with it.
 */
export function TradeInLeagueButton({
  accountId,
  label,
}: {
  accountId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    tradeInLeague,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="accountId" value={accountId} />
      <Button type="submit" size="md" disabled={pending}>
        {pending ? "Switching…" : label}
      </Button>
      {state.error ? (
        <p className="mt-2 text-[11px] font-semibold text-down">{state.error}</p>
      ) : null}
    </form>
  );
}
