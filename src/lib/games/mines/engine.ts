import { randomInt } from "../rng";

export const GRID = 25;
export const HOUSE_EDGE = 0.01;

export type MinesPublic = {
  revealed: string;
  mineCount: number;
  safeRevealed: number;
  multiplier: number;
  nextMultiplier: number;
  status: "active" | "busted" | "cashed";
  bet: number;
  payout: number;
  layout?: string; // only on terminal state
};

/** Place `mineCount` mines randomly in a 25-cell grid. */
export function makeLayout(mineCount: number): string {
  if (mineCount < 1 || mineCount > 24) throw new Error("mine_count_invalid");
  const indices = Array.from({ length: GRID }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const mineSet = new Set(indices.slice(0, mineCount));
  return Array.from({ length: GRID }, (_, i) => (mineSet.has(i) ? "m" : "-")).join("");
}

/** Multiplier after `k` safe reveals with `mines` mines.
 *  Standard "Stake" formula: (1 - edge) * C(25, k) / C(25 - mines, k). */
export function multiplierFor(mines: number, k: number): number {
  if (k === 0) return 1;
  if (k > GRID - mines) return 0;
  let num = 1;
  let den = 1;
  for (let i = 0; i < k; i++) {
    num *= GRID - i;
    den *= GRID - mines - i;
  }
  return Math.floor(((1 - HOUSE_EDGE) * num) / den * 10000) / 10000;
}

/** Count revealed safe cells (chars equal to 'r'). */
export function countSafe(revealed: string): number {
  let n = 0;
  for (const c of revealed) if (c === "r") n++;
  return n;
}
