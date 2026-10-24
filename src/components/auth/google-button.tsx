"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

export function GoogleButton({
  nextPath,
  onError,
  className,
}: {
  nextPath: string;
  onError?: (message: string) => void;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!isSupabaseConfigured()) {
      onError?.(
        "Supabase isn't connected yet — add your project keys to .env.local.",
      );
      return;
    }

    setPending(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setPending(false);
      onError?.(error.message);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] border border-line-strong bg-card text-sm font-semibold text-ink transition-colors hover:bg-hover disabled:opacity-60",
        className,
      )}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.2v3.1A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.2 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4-3.1Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.2 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
        />
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
        or
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
