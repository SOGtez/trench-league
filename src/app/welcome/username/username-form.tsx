"use client";

import { useActionState } from "react";

import { FormError, TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";

import { setUsername, type UsernameState } from "./actions";

const initialState: UsernameState = { error: null };

export function UsernameForm({ suggestion }: { suggestion: string }) {
  const [state, formAction, pending] = useActionState(
    setUsername,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <FormError>{state.error}</FormError> : null}

      <TextField
        id="username"
        name="username"
        label="Username"
        placeholder="jaydawg"
        defaultValue={suggestion}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        hint="Shown on leaderboards. 3–20 characters, letters, numbers, underscores."
        required
      />

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Claim username"}
      </Button>
    </form>
  );
}
