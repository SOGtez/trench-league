"use client";

import { useActionState } from "react";

import {
  createLeague,
  type LeagueFormState,
} from "@/app/(app)/leagues/actions";
import { FormError, TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";

const initialState: LeagueFormState = { error: null };

const BALANCES = [5, 10, 25, 100];
const DURATIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
];

const selectClass =
  "h-12 w-full rounded-[12px] border border-line bg-bg px-3 text-[15px] text-ink transition-colors hover:border-line-strong focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20";

function SelectField({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  children: React.ReactNode;
}) {
  const id = `league-${name}`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-semibold text-soft"
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={selectClass}
      >
        {children}
      </select>
    </div>
  );
}

export function CreateLeagueForm() {
  const [state, formAction, pending] = useActionState(createLeague, initialState);

  return (
    <form action={formAction} className="space-y-4 p-5">
      <TextField
        label="League name"
        id="league-name"
        name="name"
        placeholder="Friday night trenches"
        maxLength={60}
        required
        autoComplete="off"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Starting balance" name="startingBalance" defaultValue={10}>
          {BALANCES.map((balance) => (
            <option key={balance} value={balance}>
              {balance} paper SOL
            </option>
          ))}
        </SelectField>

        <SelectField label="Runs for" name="durationDays" defaultValue={7}>
          {DURATIONS.map((duration) => (
            <option key={duration.value} value={duration.value}>
              {duration.label}
            </option>
          ))}
        </SelectField>

        <SelectField label="Players" name="maxPlayers" defaultValue={10}>
          {[2, 5, 10, 20, 50, 100].map((players) => (
            <option key={players} value={players}>
              Up to {players}
            </option>
          ))}
        </SelectField>

        <SelectField label="Who can join" name="visibility" defaultValue="private">
          <option value="private">Invite code only</option>
          <option value="public">Anyone (public)</option>
        </SelectField>
      </div>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create league"}
      </Button>

      <p className="text-[12px] leading-relaxed text-muted">
        You start with the same paper balance as everyone else, in a separate
        account — your practice money is never on the line.
      </p>
    </form>
  );
}
