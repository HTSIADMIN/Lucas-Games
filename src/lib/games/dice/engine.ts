import { randInt } from "../rng";

export type DiceDirection = "over" | "under";
export type DiceResult = {
  roll: number;          // 1..100
  target: number;        // 1..98 (under) or 2..99 (over)
  direction: DiceDirection;
  win: boolean;
  multiplier: number;    // 0 if loss
  payout: number;
};

const HOUSE_EDGE = 0.01; // 1%

export function chanceOfWin(target: number, direction: DiceDirection): number {
  if (direction === "under") return Math.max(1, Math.min(98, target - 1)) / 100;
  return Math.max(1, Math.min(98, 100 - target)) / 100;
}

export function multiplierFor(target: number, direction: DiceDirection): number {
  const p = chanceOfWin(target, direction);
  if (p <= 0) return 0;
  return Math.round(((1 - HOUSE_EDGE) / p) * 10000) / 10000;
}

export function roll(target: number, direction: DiceDirection, bet: number): DiceResult {
  const r = randInt(1, 100);
  const win = direction === "under" ? r < target : r > target;
  const m = win ? multiplierFor(target, direction) : 0;
  return { roll: r, target, direction, win, multiplier: m, payout: Math.floor(bet * m) };
}
