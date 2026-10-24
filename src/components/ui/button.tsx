import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "buy" | "sell";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-semibold transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-[#071021] hover:bg-link",
  secondary: "border border-line-strong bg-card text-ink hover:bg-hover",
  ghost: "text-soft hover:bg-hover hover:text-ink",
  buy: "bg-up text-[#04140d] hover:bg-[#5EE6A9]",
  sell: "bg-down text-[#1a0c03] hover:bg-[#FFA270]",
};

/* Every size keeps a 44px minimum touch target. */
const sizes: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-[13px]",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonStyles({ variant, size, className })} {...props} />
  );
}
