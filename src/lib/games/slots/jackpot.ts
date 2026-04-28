// Progressive Boomtown jackpot pool.
//
// The pool is derived from the wallet ledger rather than held in
// memory: every `slots_bet` debit grows it, every `slots_jackpot`
// credit drains it, and the live value is just
//   STARTING_POOL - sum(deltas of those two reasons).
// This means we don't lose progress on Vercel cold starts and the
// number is identical across concurrent serverless invocations
// without any extra synchronisation.

import { slotsJackpotLedgerSum } from "@/lib/db";

export const STARTING_POOL = 1_000_000;
/** 1 in N spins triggers the jackpot. */
export const JACKPOT_ODDS = 5_000;

/** Read the current pool size from the wallet ledger. */
export async function getJackpotPool(): Promise<number> {
  // ledgerSum = (negative) bet deltas + (positive) payout deltas.
  // Pool grows by abs(bets) and shrinks by payouts, so:
  //   pool = STARTING_POOL + (-betSum) - paySum
  //        = STARTING_POOL - (betSum + paySum)
  //        = STARTING_POOL - ledgerSum
  const ledgerSum = await slotsJackpotLedgerSum();
  const pool = STARTING_POOL - ledgerSum;
  return Math.max(STARTING_POOL, Math.floor(pool));
}

/** Roll the 1-in-N trigger. Returns true if the spin should jackpot. */
export function rollJackpotTrigger(): boolean {
  // crypto-grade randomness via node:crypto so this isn't gameable
  // by repeat sampling — same source the engine uses for symbols.
  // randomInt(0, N) returns [0, N).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomInt } = require("node:crypto") as typeof import("node:crypto");
  return randomInt(0, JACKPOT_ODDS) === 0;
}
