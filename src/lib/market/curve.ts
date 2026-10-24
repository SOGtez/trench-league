/**
 * pump.fun bonding-curve progress.
 *
 * The curve fills at a fixed amount of SOL, so the USD value of a coin at
 * graduation scales with the SOL price: FDV_at_graduation ≈ 411 × SOL price.
 *
 * Calibrated against live data (SOL ≈ $101.5): coins still on the `pump-fun`
 * dex top out at $41.1–41.6K FDV, while anything above that is already trading
 * on a `pumpswap` pool. 411 × 101.5 ≈ $41.7K reproduces that ceiling within a
 * few percent, which is as precise as a provider-side estimate gets — the
 * exact number depends on fees paid into the curve.
 *
 * This is a display estimate. Phase 3 (trading engine) reads the real curve
 * reserves before quoting a fill.
 */
export const PUMP_CURVE_GRADUATION_FDV_PER_SOL = 411;

export function graduationFdvUsd(solPriceUsd: number | null): number | null {
  if (!solPriceUsd || solPriceUsd <= 0) return null;
  return PUMP_CURVE_GRADUATION_FDV_PER_SOL * solPriceUsd;
}

export function curveProgressPct(
  fdvUsd: number | null,
  solPriceUsd: number | null,
): number | null {
  if (!fdvUsd || fdvUsd <= 0) return null;
  const target = graduationFdvUsd(solPriceUsd);
  if (!target) return null;
  return Math.max(0, Math.min(100, (fdvUsd / target) * 100));
}
