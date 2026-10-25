"use client";

import { track } from "@vercel/analytics";

/**
 * Product events, on top of the page views `<Analytics />` already records.
 *
 * Vercel Web Analytics is cookieless and stores no personal data, so this needs
 * no consent banner. It is also best-effort: a blocked script or an offline tab
 * must never break a trade the user already made, hence the try/catch.
 */
export type AnalyticsProps = Record<string, string | number | boolean>;

export function trackEvent(name: string, props?: AnalyticsProps): void {
  try {
    track(name, props);
  } catch {
    // Analytics is not worth an error in the trade path.
  }
}
