import { cn, initials } from "@/lib/utils";

/** Stable colour per mint so a coin keeps its badge across refreshes. */
function hueFor(mint: string): number {
  let hash = 0;
  for (let index = 0; index < mint.length; index += 1) {
    hash = (hash * 31 + mint.charCodeAt(index)) % 360;
  }
  return hash;
}

export function TokenAvatar({
  mint,
  symbol,
  className,
}: {
  mint: string;
  symbol: string;
  className?: string;
}) {
  const hue = hueFor(mint);
  // Emoji-only tickers have no alphanumerics for `initials` to use.
  const letters = initials(symbol);
  const badge = letters === "?" ? symbol.slice(0, 2) : letters;

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold uppercase tracking-wide text-white/90 ring-1 ring-inset ring-white/10",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 62% 44%), hsl(${(hue + 52) % 360} 68% 26%))`,
      }}
    >
      {badge}
    </span>
  );
}
