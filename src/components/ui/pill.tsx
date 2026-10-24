import { cn } from "@/lib/utils";

type PillTone = "neutral" | "brand" | "gold" | "up" | "down";

const tones: Record<PillTone, string> = {
  neutral: "border-line-strong bg-hover text-soft",
  brand: "border-brand/30 bg-brand/12 text-link",
  gold: "border-gold/30 bg-gold/12 text-gold",
  up: "border-up/25 bg-up/12 text-up",
  down: "border-down/25 bg-down/12 text-down",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
