// Random "Hot Number" event for Roulette. A single number 0..36
// glows on the betting grid for ~30 seconds at a time. While it's
// hot, a straight bet on that number pays 50× instead of 35×
// (stake + 50× win = 51× total payout) when it hits.
//
// Module-level state — cheap, scoped to the running process. On
// cold start the rotation kicks off fresh; the player just sees a
// fresh hot number on next page load.

import { randomInt } from "node:crypto";

/** How long a single hot number stays hot before rotating. */
const HOT_TTL_MS = 30_000;

/** Default odds vs hot odds — these constants live here so both
 *  the spin route and the client legend can reference them. */
export const STRAIGHT_PAYOUT = 35;
export const HOT_PAYOUT = 50;

let _hotNumber: number = randomInt(0, 37);
let _hotUntil: number = Date.now() + HOT_TTL_MS;

function rotateIfStale() {
  if (Date.now() >= _hotUntil) {
    let next = randomInt(0, 37);
    // Don't repeat back-to-back so the rotation reads.
    if (next === _hotNumber) next = (next + 1) % 37;
    _hotNumber = next;
    _hotUntil = Date.now() + HOT_TTL_MS;
  }
}

export function getHotNumber(): { value: number; expiresAt: number } {
  rotateIfStale();
  return { value: _hotNumber, expiresAt: _hotUntil };
}
