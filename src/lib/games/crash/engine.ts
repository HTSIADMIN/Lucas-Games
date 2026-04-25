// Crash multiplier curve: m(t) = exp(GROWTH * t_seconds).
// At GROWTH = 0.06: doubles every ~11.5s.
// At GROWTH = 0.10: doubles every ~7s (snappier).
export const GROWTH = 0.08;

export const HOUSE_EDGE = 0.01;
const PRECISION = 1_000_000;

import { randomInt } from "../rng";

/**
 * Pick a crash point with ~1% house edge.
 * Distribution: P(crash <= m) ≈ 1 - 1/m for m >= 1, with HOUSE_EDGE prob of 1.0.
 *
 * Sample u ∈ (0,1) uniformly; if u < HOUSE_EDGE, crash at 1.00.
 * Else crash at floor((100 - HOUSE_EDGE*100) / (100 * (1 - u))) / 100,
 * clamped to [1.00, 1000.00].
 */
export function pickCrashPoint(): number {
  const u = randomInt(0, PRECISION) / PRECISION; // [0, 1)
  if (u < HOUSE_EDGE) return 1.0;
  const x = (100 - HOUSE_EDGE * 100) / (100 * (1 - u));
  return Math.max(1.0, Math.min(1000, Math.floor(x * 100) / 100));
}

/** Compute multiplier at elapsed seconds. */
export function multiplierAt(elapsedSec: number): number {
  if (elapsedSec <= 0) return 1.0;
  return Math.exp(GROWTH * elapsedSec);
}

/** Inverse: at what elapsed seconds does multiplier reach `m`? */
export function timeForMultiplier(m: number): number {
  if (m <= 1) return 0;
  return Math.log(m) / GROWTH;
}
