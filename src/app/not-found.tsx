import Link from "next/link";

import { Wordmark } from "@/components/logo";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center px-6">
          <Wordmark />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 py-16">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
          404
        </p>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-ink">
          Nothing at this address
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Either the coin never existed, the league is private, or the link has a
          typo in it. Paste a contract address into Discover to open any token.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          <Link href="/discover" className={buttonStyles({ size: "lg" })}>
            Open Discover
          </Link>
          <Link
            href="/"
            className={buttonStyles({ variant: "secondary", size: "lg" })}
          >
            Go home
          </Link>
        </div>
      </main>
    </div>
  );
}
