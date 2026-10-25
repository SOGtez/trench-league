"use client";

import { useActionState } from "react";

import { joinLeague, type LeagueFormState } from "@/app/(app)/leagues/actions";
import { Button } from "@/components/ui/button";

const initialState: LeagueFormState = { error: null };

/**
 * Public leagues are joinable without typing anything, but they still go
 * through the same invite-code RPC so the account is created atomically.
 */
export function PublicLeagueJoin({
  code,
  disabled,
  label = "Join",
}: {
  code: string;
  disabled?: boolean;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(joinLeague, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end">
      <input type="hidden" name="code" value={code} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
      >
        {pending ? "Joining…" : label}
      </Button>
      {state.error ? (
        <p className="mt-1.5 text-right text-[11px] font-semibold text-down">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
