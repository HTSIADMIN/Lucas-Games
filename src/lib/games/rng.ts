// Server-side cryptographic RNG. NEVER use Math.random for game outcomes.
import { randomInt as nodeRandomInt } from "node:crypto";

/** Inclusive lower, exclusive upper. */
export function randomInt(min: number, max: number): number {
  return nodeRandomInt(min, max);
}

/** Inclusive both ends. */
export function randInt(min: number, max: number): number {
  return nodeRandomInt(min, max + 1);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length)];
}
