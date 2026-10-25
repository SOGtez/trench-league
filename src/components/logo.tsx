import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-[10px] bg-brand text-[#071021]",
        className,
      )}
      aria-hidden
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 15.5 9 10l4 3.5 7-8" />
        <path d="M4 20h16" />
      </svg>
    </span>
  );
}

export function Wordmark({
  className,
  compact = false,
}: {
  className?: string;
  /** Mark only on phones, so the app header still fits a 390px screen. */
  compact?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5", className)}
      aria-label="Trench League home"
    >
      <LogoMark />
      <span
        className={cn(
          "text-[15px] font-extrabold tracking-tight text-ink",
          compact && "hidden sm:inline",
        )}
      >
        Trench League
      </span>
    </Link>
  );
}
