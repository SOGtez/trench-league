import type { InputHTMLAttributes } from "react";

export function TextField({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-semibold text-soft"
      >
        {label}
      </label>
      <input
        id={id}
        className="h-12 w-full rounded-[12px] border border-line bg-bg px-3.5 text-[15px] text-ink placeholder:text-muted/60 transition-colors hover:border-line-strong focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
        {...props}
      />
      {hint ? <p className="mt-1.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-down/30 bg-down/10 px-3.5 py-3 text-[13px] font-medium text-down"
    >
      {children}
    </div>
  );
}
