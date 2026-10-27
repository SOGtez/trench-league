"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

export type LivePriceTick = {
  priceUsd: number;
  fdvUsd: number | null;
  change1hPct: number | null;
};

type StreamState = {
  prices: Record<string, LivePriceTick>;
  updatedAt: number;
  status: "idle" | "live" | "degraded";
};

/** One request per second for every coin on the page, shared by all components. */
const POLL_MS = 1_000;
const HIDDEN_POLL_MS = 15_000;
const MAX_BACKOFF_MS = 8_000;
const MAX_MINTS = 30;

let state: StreamState = { prices: {}, updatedAt: 0, status: "idle" };
const listeners = new Set<() => void>();

/**
 * Refcount per mint, so two components watching the same coin (chart and trade
 * panel) still produce a single request, and a coin stops being polled the
 * moment nothing on the page displays it.
 */
const retained = new Map<string, number>();

let timer: number | null = null;
let inFlight = false;
let delayMs = POLL_MS;
let listening = false;

function emit(next: StreamState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StreamState {
  return state;
}

function schedule(ms: number) {
  if (typeof window === "undefined") return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(run, ms);
}

async function run() {
  timer = null;
  if (retained.size === 0) return;

  // A hidden tab has nobody watching it: keep the subscription alive but stop
  // spending requests until it comes back.
  if (document.visibilityState === "hidden") {
    schedule(HIDDEN_POLL_MS);
    return;
  }

  const mints = [...retained.keys()].slice(0, MAX_MINTS);
  inFlight = true;

  try {
    const response = await fetch(
      `/api/market/tick?mints=${encodeURIComponent(mints.join(","))}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = (await response.json()) as {
      prices?: Record<string, LivePriceTick>;
    };
    merge(body.prices ?? {});
    delayMs = POLL_MS;
  } catch {
    delayMs = Math.min(delayMs * 2, MAX_BACKOFF_MS);
    if (state.status !== "degraded") {
      emit({ ...state, status: "degraded" });
    }
  } finally {
    inFlight = false;
    schedule(delayMs);
  }
}

function merge(next: Record<string, LivePriceTick>) {
  const merged: Record<string, LivePriceTick> = { ...state.prices };
  let changed = false;

  for (const [mint, tick] of Object.entries(next)) {
    if (!retained.has(mint)) continue;
    const previous = merged[mint];
    // Prices arrive as strings upstream; only a real move is worth a render.
    if (!previous || previous.priceUsd !== tick.priceUsd) {
      merged[mint] = tick;
      changed = true;
    }
  }

  for (const mint of Object.keys(merged)) {
    if (!retained.has(mint)) {
      delete merged[mint];
      changed = true;
    }
  }

  if (changed || state.status !== "live") {
    emit({ prices: merged, updatedAt: Date.now(), status: "live" });
  }
}

function retain(mint: string) {
  retained.set(mint, (retained.get(mint) ?? 0) + 1);
  start();
}

function release(mint: string) {
  const count = (retained.get(mint) ?? 0) - 1;
  if (count > 0) retained.set(mint, count);
  else retained.delete(mint);
}

function start() {
  if (typeof window === "undefined") return;

  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      // Back from a hidden tab: fetch immediately rather than waiting out the
      // slow hidden cadence.
      delayMs = POLL_MS;
      if (!inFlight) schedule(0);
    });
  }

  if (timer === null && !inFlight) schedule(0);
}

/**
 * Live prices for the given mints, refreshed every second.
 *
 * Every component using this shares one stream: the coin page's chart, header
 * and trade panel all watching the same mint still cost a single request per
 * second, and a page full of rows costs the same as one.
 */
export function useLivePrices(mints: string[]): Record<string, LivePriceTick> {
  // A stable key so an inline array literal does not re-subscribe every render.
  const key = [...new Set(mints.filter(Boolean))].sort().join(",");

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    for (const mint of list) retain(mint);
    return () => {
      for (const mint of list) release(mint);
    };
  }, [key]);

  const stream = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(() => {
    if (!key) return {};
    const slice: Record<string, LivePriceTick> = {};
    for (const mint of key.split(",")) {
      const tick = stream.prices[mint];
      if (tick) slice[mint] = tick;
    }
    return slice;
  }, [key, stream.prices]);
}

/** Connection state of the shared stream, for the small "live" indicators. */
export function useLiveStatus(): StreamState["status"] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).status;
}
