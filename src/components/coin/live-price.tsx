"use client";

import { useEffect, useRef, useState } from "react";

import { useLivePrices } from "@/lib/market/live-prices";
import { cn, formatPct, formatUsdPrice, toneForPnl } from "@/lib/utils";

/**
 * The headline price, repainted from the 1s stream.
 *
 * The number is server-rendered first, so the page has a price the instant it
 * paints; the stream then takes over. A brief tint on the move keeps a busy
 * coin readable without animating the digits themselves.
 */
export function LivePrice({
  mint,
  initialPriceUsd,
  initialChange1hPct,
}: {
  mint: string;
  initialPriceUsd: number | null;
  initialChange1hPct: number | null;
}) {
  const tick = useLivePrices([mint])[mint];
  const priceUsd = tick?.priceUsd ?? initialPriceUsd;
  const change1hPct = tick?.change1hPct ?? initialChange1hPct;

  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const previous = useRef<number | null>(priceUsd);

  useEffect(() => {
    const before = previous.current;
    previous.current = priceUsd;
    if (before === null || priceUsd === null || priceUsd === before) return;

    setFlash(priceUsd > before ? "up" : "down");
    const id = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(id);
  }, [priceUsd]);

  return (
    <>
      <p
        className={cn(
          "num text-[26px] font-bold leading-none transition-colors duration-300",
          flash === "up"
            ? "text-up"
            : flash === "down"
              ? "text-down"
              : "text-ink",
        )}
      >
        {formatUsdPrice(priceUsd)}
      </p>
      <p
        className={cn(
          "num mt-1.5 text-[13px] font-semibold",
          toneForPnl(change1hPct),
        )}
      >
        {formatPct(change1hPct)} · 1h
      </p>
    </>
  );
}
