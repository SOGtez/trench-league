"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function InviteCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard access can be blocked — the code is selectable either way.
      setFailed(true);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[12px] border border-line bg-bg px-3 py-2",
        className,
      )}
    >
      <span className="num select-all text-[15px] font-bold tracking-[0.18em] text-ink">
        {code}
      </span>
      <button
        type="button"
        onClick={copy}
        className="ml-auto shrink-0 rounded-[9px] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        {copied ? "Copied" : failed ? "Select" : "Copy"}
      </button>
    </div>
  );
}
