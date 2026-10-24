import { cn } from "@/lib/utils";

/**
 * The paper-trading disclaimer. Required near every buy/sell control.
 */
export function PaperLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-gold" aria-hidden />
      Paper trading · no real money
    </span>
  );
}
