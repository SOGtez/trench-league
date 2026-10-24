import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line-strong bg-bg/40 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-[14px] font-semibold text-soft">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
