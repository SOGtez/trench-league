"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Trade-panel preferences.
 *
 * These are per-browser UI choices (how many chips, how much slippage you'll
 * accept, whether fills beep), so they live in localStorage rather than the
 * database — nothing here changes what a fill costs, and a paper account should
 * not need a migration to gain a button.
 */

export type TradeSettings = {
  /** Quick-buy chips, in SOL. */
  buyAmounts: number[];
  /** Quick-sell chips, as a percentage of the position. */
  sellPercents: number[];
  /** Fills whose price impact exceeds this are refused. */
  slippagePct: number;
  soundOn: boolean;
  /** Draw avg-entry line and your fills on the chart. */
  chartMarkers: boolean;
  /** Simulated confirmation latency, 0 = instant. */
  delayMs: number;
};

export const DEFAULT_SETTINGS: TradeSettings = {
  buyAmounts: [0.1, 0.2, 0.5, 1, 3, 5, 10, 20],
  sellPercents: [10, 25, 50, 100],
  slippagePct: 20,
  soundOn: true,
  chartMarkers: true,
  delayMs: 0,
};

const STORAGE_KEY = "trench:trade-settings:v1";
const CHANGE_EVENT = "trench:trade-settings";

export const BUY_AMOUNT_MAX = 8;
export const SELL_PERCENT_MAX = 4;
export const DELAY_MAX_MS = 1_500;
export const SLIPPAGE_MIN = 1;
export const SLIPPAGE_MAX = 99;

function cleanNumbers(
  values: unknown,
  { max, ceiling }: { max: number; ceiling?: number },
): number[] | null {
  if (!Array.isArray(values)) return null;

  const numbers = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (!numbers.length) return null;

  return numbers
    .map((value) => (ceiling ? Math.min(value, ceiling) : value))
    .slice(0, max);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sanitise(raw: unknown): TradeSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const input = raw as Partial<TradeSettings>;

  return {
    buyAmounts:
      cleanNumbers(input.buyAmounts, { max: BUY_AMOUNT_MAX, ceiling: 1_000 }) ??
      DEFAULT_SETTINGS.buyAmounts,
    sellPercents:
      cleanNumbers(input.sellPercents, {
        max: SELL_PERCENT_MAX,
        ceiling: 100,
      }) ?? DEFAULT_SETTINGS.sellPercents,
    slippagePct:
      typeof input.slippagePct === "number" &&
      Number.isFinite(input.slippagePct)
        ? clamp(input.slippagePct, SLIPPAGE_MIN, SLIPPAGE_MAX)
        : DEFAULT_SETTINGS.slippagePct,
    soundOn:
      typeof input.soundOn === "boolean"
        ? input.soundOn
        : DEFAULT_SETTINGS.soundOn,
    chartMarkers:
      typeof input.chartMarkers === "boolean"
        ? input.chartMarkers
        : DEFAULT_SETTINGS.chartMarkers,
    delayMs:
      typeof input.delayMs === "number" && Number.isFinite(input.delayMs)
        ? clamp(Math.round(input.delayMs), 0, DELAY_MAX_MS)
        : DEFAULT_SETTINGS.delayMs,
  };
}

export function readTradeSettings(): TradeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return sanitise(JSON.parse(stored));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeTradeSettings(next: TradeSettings) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage full: the panel keeps the value for this session.
  }

  snapshotCache = next;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

export function resetTradeSettings() {
  writeTradeSettings(DEFAULT_SETTINGS);
}

/* -------------------------------------------------------------------------- */
/* External store                                                             */
/* -------------------------------------------------------------------------- */

/** 
 * `getSnapshot` must stay referentially stable between changes, or React will
 * loop, so the parsed value is cached until something invalidates it.
 */
let snapshotCache: TradeSettings | null = null;

function subscribeToSettings(onStoreChange: () => void) {
  const invalidate = () => {
    snapshotCache = null;
    onStoreChange();
  };

  window.addEventListener(CHANGE_EVENT, invalidate);
  window.addEventListener("storage", invalidate);

  return () => {
    window.removeEventListener(CHANGE_EVENT, invalidate);
    window.removeEventListener("storage", invalidate);
  };
}

function getSettingsSnapshot(): TradeSettings {
  if (!snapshotCache) snapshotCache = readTradeSettings();
  return snapshotCache;
}

function getServerSnapshot(): TradeSettings {
  return DEFAULT_SETTINGS;
}

/** Parses "0.1, 0.5, 1" into numbers, ignoring junk. */
export function parseAmountList(input: string, max: number): number[] {
  return input
    .split(/[\s,]+/)
    .map((part) => Number(part.replace(/[^\d.]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, max);
}

/**
 * Shared settings state. Two components read this (the trade panel and the
 * chart), so a change in one has to reach the other without a reload, and the
 * server render has to agree with the first client paint — hence an external
 * store with a server snapshot instead of a `useEffect` that copies storage
 * into state after hydration.
 */
export function useTradeSettings() {
  const settings = useSyncExternalStore(
    subscribeToSettings,
    getSettingsSnapshot,
    getServerSnapshot,
  );

  const update = useCallback((patch: Partial<TradeSettings>) => {
    writeTradeSettings(sanitise({ ...getSettingsSnapshot(), ...patch }));
  }, []);

  return { settings, update };
}

/** Short blip on a fill, so a fast click has some feedback beyond the toast. */
export function playFillSound(side: "buy" | "sell") {
  if (typeof window === "undefined") return;

  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtor) return;

  try {
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.value = side === "buy" ? 640 : 420;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio is a nicety; never let it break a fill.
  }
}
