"use client";

import { useState } from "react";

import { cn, initials } from "@/lib/utils";

/** Stable colour per mint so a coin keeps its badge across refreshes. */
function hueFor(mint: string): number {
  let hash = 0;
  for (let index = 0; index < mint.length; index += 1) {
    hash = (hash * 31 + mint.charCodeAt(index)) % 360;
  }
  return hash;
}

/**
 * Real token art, or the generated badge when there is none.
 *
 * The image is the URL the market feed reported, hot-linked from whichever CDN
 * hosts it. A failed load (dead link, blocked host, no connection) swaps to the
 * badge instead of leaving a broken image behind.
 */
export function TokenAvatar({
  mint,
  symbol,
  logoUrl,
  className,
}: {
  mint: string;
  symbol: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const hue = hueFor(mint);
  // Emoji-only tickers have no alphanumerics for `initials` to use.
  const letters = initials(symbol);
  const badge = letters === "?" ? symbol.slice(0, 2) : letters;

  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-bold uppercase tracking-wide text-white/90 ring-1 ring-inset ring-white/10",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 62% 44%), hsl(${(hue + 52) % 360} 68% 26%))`,
      }}
    >
      {logoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a different CDN per coin
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        badge
      )}
    </span>
  );
}
