"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { FormError, TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function LoginForm({
  nextPath,
  initialError,
}: {
  nextPath: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError(
        "Supabase isn't connected yet — add your project keys to .env.local.",
      );
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "Wrong email or password."
          : signInError.message,
      );
      setPending(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error ? <FormError>{error}</FormError> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          id="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <OrDivider />

      <GoogleButton nextPath={nextPath} onError={setError} />
    </div>
  );
}
