"use client";

import { useEffect, useState } from "react";

import {
  BUY_AMOUNT_MAX,
  DELAY_MAX_MS,
  parseAmountList,
  SELL_PERCENT_MAX,
  SLIPPAGE_MAX,
  SLIPPAGE_MIN,
  useTradeSettings,
} from "@/lib/trade/settings";
import { cn, formatSolAmount } from "@/lib/utils";

/**
 * Trade settings.
 *
 * Only the knobs that change real behaviour are here: the quick-size chips, the
 * price-impact limit that can veto a fill, and how the terminal feels. Fees are
 * not editable — the house fee is what the pricing engine charges — so they are
 * shown for reference instead of pretending to be a dial.
 */
export function TradeSettingsDialog({
  onClose,
  feeBps,
  priorityFeeSol,
}: {
  onClose: () => void;
  feeBps: number;
  priorityFeeSol: number;
}) {
  const { settings, update } = useTradeSettings();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  // Mounted only while open, so the drafts seed themselves from the store once
  // and free typing is never overwritten by its own echo.
  const [buyDraft, setBuyDraft] = useState(() => settings.buyAmounts.join(", "));
  const [sellDraft, setSellDraft] = useState(() =>
    settings.sellPercents.join(", "),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buyPreview = parseAmountList(buyDraft, BUY_AMOUNT_MAX);
  const sellPreview = parseAmountList(sellDraft, SELL_PERCENT_MAX);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 py-10 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-settings-title"
        className="w-full max-w-[400px] rounded-[18px] border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2
            id="trade-settings-title"
            className="text-[14px] font-bold text-ink"
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-line">
          {(["buy", "sell"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              className={cn(
                "relative h-10 text-[12px] font-bold uppercase tracking-wider transition-colors",
                tab === option ? "text-ink" : "text-muted hover:text-soft",
              )}
            >
              {option} settings
              {tab === option ? (
                <span className="absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-up" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="space-y-5 px-4 py-4">
          {tab === "buy" ? (
            <Field
              label="Quick buy amounts"
              hint={`Up to ${BUY_AMOUNT_MAX}, in SOL. Comma separated.`}
            >
              <AmountInput
                value={buyDraft}
                onChange={(value) => {
                  setBuyDraft(value);
                  const parsed = parseAmountList(value, BUY_AMOUNT_MAX);
                  if (parsed.length) update({ buyAmounts: parsed });
                }}
                placeholder="0.1, 0.2, 0.5, 1"
              />
              <Chips values={buyPreview.map((value) => `${value} SOL`)} />
            </Field>
          ) : (
            <Field
              label="Quick sell amounts"
              hint={`Up to ${SELL_PERCENT_MAX}, as a % of the position.`}
            >
              <AmountInput
                value={sellDraft}
                onChange={(value) => {
                  setSellDraft(value);
                  const parsed = parseAmountList(value, SELL_PERCENT_MAX);
                  if (parsed.length) update({ sellPercents: parsed });
                }}
                placeholder="10, 25, 50, 100"
              />
              <Chips values={sellPreview.map((value) => `${value}%`)} />
            </Field>
          )}

          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-soft">
                  Slippage tolerance
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">
                  Fills that would move the price more than this are blocked
                  before they go through.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-[10px] border border-line bg-bg px-2 py-1">
                <input
                  type="number"
                  min={SLIPPAGE_MIN}
                  max={SLIPPAGE_MAX}
                  step={1}
                  value={settings.slippagePct}
                  onChange={(event) =>
                    update({ slippagePct: Number(event.target.value) })
                  }
                  aria-label="Slippage tolerance percent"
                  className="num w-10 bg-transparent text-right text-[13px] font-bold text-ink focus:outline-none"
                />
                <span className="text-[12px] text-muted">%</span>
              </div>
            </div>

            <div className="rounded-[10px] border border-line bg-header px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              <span className="font-semibold text-soft">Fees per fill: </span>
              {feeBps / 100}% of size + {formatSolAmount(priorityFeeSol)} SOL
              priority. Set by the house — identical for every player.
            </div>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Feel
            </p>

            <Toggle
              label="Chart markers"
              hint="Avg-entry line and your own fills on the chart"
              checked={settings.chartMarkers}
              onChange={(checked) => update({ chartMarkers: checked })}
            />
            <Toggle
              label="Sound on fill"
              hint="A short blip when a trade lands"
              checked={settings.soundOn}
              onChange={(checked) => update({ soundOn: checked })}
            />

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold text-soft">
                  Confirmation delay
                </p>
                <span className="num text-[12px] font-bold text-soft">
                  {settings.delayMs === 0
                    ? "Instant"
                    : `${settings.delayMs} ms`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={DELAY_MAX_MS}
                step={50}
                value={settings.delayMs}
                onChange={(event) =>
                  update({ delayMs: Number(event.target.value) })
                }
                aria-label="Simulated confirmation delay"
                className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[#3ddc97]"
              />
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                Holds the fill for a moment so it feels like a chain
                confirmation. Off by default.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              update({
                buyAmounts: [0.1, 0.2, 0.5, 1, 3, 5, 10, 20],
                sellPercents: [10, 25, 50, 100],
                slippagePct: 20,
                soundOn: true,
                chartMarkers: true,
                delayMs: 0,
              });
              setBuyDraft("0.1, 0.2, 0.5, 1, 3, 5, 10, 20");
              setSellDraft("10, 25, 50, 100");
            }}
            className="w-full rounded-[10px] border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:border-line-strong hover:text-soft"
          >
            Reset to defaults
          </button>

          <p className="text-center text-[10px] text-muted/70">
            Saved on this device.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-soft">{label}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function AmountInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="num h-9 w-full rounded-[10px] border border-line bg-bg px-2.5 text-[12px] text-ink placeholder:text-muted/60 focus:border-up/60 focus:outline-none"
    />
  );
}

function Chips({ values }: { values: string[] }) {
  if (!values.length) {
    return (
      <p className="text-[11px] text-down">
        Enter at least one amount to keep your chips.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="rounded-[8px] border border-line bg-card px-2 py-1 text-[11px] font-semibold text-soft"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#3ddc97]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-soft">
          {label}
        </span>
        <span className="block text-[11px] leading-snug text-muted">{hint}</span>
      </span>
    </label>
  );
}
