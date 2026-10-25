"use client";

import { useActionState } from "react";

import {
  joinLeague,
  type LeagueFormState,
} from "@/app/(app)/leagues/actions";
import { FormError } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";

const initialState: LeagueFormState = { error: null };

export function JoinLeagueForm() {
  const [state, formAction, pending] = useActionState(joinLeague, initialState);

  return (
    <form action={formAction} className="space-y-4 p-5">
      <div>
        <label
          htmlFor="invite-code"
          className="mb-1.5 block text-[13px] font-semibold text-soft"
        >
          Invite code
        </label>
        <input
          id="invite-code"
          name="code"
          placeholder="ABCD2345"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          className="num h-12 w-full rounded-[12px] border border-line bg-bg px-3.5 text-[17px] font-bold uppercase tracking-[0.18em] text-ink placeholder:font-normal placeholder:tracking-[0.1em] placeholder:text-muted/50 transition-colors hover:border-line-strong focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Joining…" : "Join league"}
      </Button>

      <p className="text-[12px] leading-relaxed text-muted">
        Joining opens a fresh league account with the league&apos;s starting
        balance. Late joins keep the full balance, so the board ranks by %
        gain rather than raw SOL.
      </p>
    </form>
  );
}
