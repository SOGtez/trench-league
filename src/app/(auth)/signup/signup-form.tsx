"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { FormError, TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setError(
        "Supabase isn't connected yet — add your project keys to .env.local.",
      );
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome/username`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }

    // If email confirmation is enabled in Supabase there is no session yet.
    if (data.session) {
      router.push("/welcome/username");
      router.refresh();
      return;
    }

    setPending(false);
    setAwaitingConfirmation(true);
  }

  if (awaitingConfirmation) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-up/30 bg-up/10 text-up">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m3 7 9 6 9-6" />
            <rect x="3" y="5" width="18" height="14" rx="2" />
          </svg>
        </div>
        <h2 className="text-[17px] font-bold">Check your email</h2>
        <p className="text-sm text-muted">
          We sent a confirmation link to{" "}
          <span className="font-semibold text-soft">{email}</span>. Open it to
          activate your account, then pick your username.
        </p>
      </div>
    );
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <OrDivider />

      <GoogleButton nextPath="/welcome/username" onError={setError} />
    </div>
  );
}
