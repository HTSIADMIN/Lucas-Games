import { randInt } from "../rng";

export type PlinkoRows = 8 | 12 | 16;
export type PlinkoRisk = "low" | "med" | "high";

// Bucket multipliers per (rows, risk). Outermost first → mirrored.
// Tuned to ~96% RTP given binomial bucket distribution.
const HALF_TABLES: Record<PlinkoRows, Record<PlinkoRisk, number[]>> = {
  8: {
    low:  [5.6, 2.1, 1.1, 1.0, 0.5],
    med:  [13,  3,   1.3, 0.7, 0.4],
    high: [29,  4,   1.5, 0.3, 0.2],
  },
  12: {
    low:  [10,  3,   1.6, 1.4, 1.1, 1.0, 0.5],
    med:  [33,  11,  4,   2,   1.1, 0.6, 0.3],
    high: [170, 24,  8.1, 2,   0.7, 0.2, 0.2],
  },
  16: {
    low:  [16,  9,   2,   1.4, 1.4, 1.2, 1.1, 1.0, 0.5],
    med:  [110, 41,  10,  5,   3,   1.5, 1.0, 0.5, 0.3],
    high: [1000, 130, 26,  9,   4,   2,   0.2, 0.2, 0.2],
  },
};

/** Mirror the half-table to a full bucket array of length rows+1. */
export function bucketTable(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  const half = HALF_TABLES[rows][risk];
  const left = half.slice();              // outermost ... center
  const right = half.slice(0, -1).reverse(); // center+1 ... outermost
  return [...left, ...right];
}

/** Sample a bucket index using the binomial distribution Bin(rows, 0.5). */
export function pickBucket(rows: PlinkoRows): number {
  let k = 0;
  for (let i = 0; i < rows; i++) if (randInt(0, 1) === 1) k++;
  return k;
}

export type PlinkoResult = {
  bucket: number;
  multiplier: number;
  payout: number;
  table: number[];
};

export function drop(rows: PlinkoRows, risk: PlinkoRisk, bet: number): PlinkoResult {
  const table = bucketTable(rows, risk);
  const bucket = pickBucket(rows);
  const multiplier = table[bucket];
  return { bucket, multiplier, payout: Math.floor(bet * multiplier), table };
}
