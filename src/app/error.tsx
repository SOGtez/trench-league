"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Wordmark } from "@/components/logo";
import { buttonStyles } from "@/components/ui/button";

/**
 * Last-resort boundary. A thrown error in a page or action lands here instead of
 * a blank tab; the message is deliberately generic because the real one may name
 * a table or a token we do not want to print in production.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel captures unhandled errors from the server logs; keeping the digest
    // makes those lines findable here.
    console.error(`Unhandled error${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center px-6">
          <Wordmark />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 py-16">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Something broke
        </p>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-ink">
          That request didn&apos;t make it
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          The page hit an error while loading. Your balance is untouched — trades
          only move paper SOL once they fill. Try again, and if it keeps failing
          the market feed is probably down.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className={buttonStyles({ size: "lg" })}
          >
            Try again
          </button>
          <Link
            href="/discover"
            className={buttonStyles({
              variant: "secondary",
              size: "lg",
            })}
          >
            Back to Discover
          </Link>
        </div>

        {error.digest ? (
          <p className="num mt-6 text-[11px] text-muted/60">
            Reference: {error.digest}
          </p>
        ) : null}
      </main>
    </div>
  );
}
