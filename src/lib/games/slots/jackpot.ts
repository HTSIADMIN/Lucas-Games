// Progressive Boomtown jackpot pool.
//
// In-memory module-level state. The pool starts at $1M and accrues
// every coin spent on the slots `bet` debit. A separate 1-in-5000
// trigger inside the spin route can clear the entire pool to a
// player. After consumption it resets to STARTING_POOL.
//
// Cold-start trade-off: the pool currently doesn't persist across
// process restarts (no DB column / table for it yet). On boot it
// resets to STARTING_POOL. Acceptable for the friends-only casino
// scale; can be hardened later by either backing this with a row in
// earn_cooldowns or by deriving from the wallet ledger
// (sum(slots_bet) - sum(slots_jackpot) + STARTING_POOL).

export const STARTING_POOL = 1_000_000;
/** 1 in N spins triggers the jackpot. */
export const JACKPOT_ODDS = 5_000;

let _pool = STARTING_POOL;

/** Read the current pool size. */
export function getJackpotPool(): number {
  return _pool;
}

/** Accrue a player's bet into the pool. Returns the new pool size. */
export function addBetToPool(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return _pool;
  _pool += Math.floor(amount);
  return _pool;
}

/** Roll the 1-in-N trigger. Returns true if the spin should jackpot. */
export function rollJackpotTrigger(): boolean {
  // crypto-grade randomness via node:crypto so this isn't gameable
  // by repeat sampling — same source the engine uses for symbols.
  // We import lazily to keep the module side-effect free for tests.
  // randomInt(0, N) returns [0, N).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomInt } = require("node:crypto") as typeof import("node:crypto");
  return randomInt(0, JACKPOT_ODDS) === 0;
}

/** Pay out + reset the pool. Returns the payout amount. */
export function consumeJackpot(): number {
  const payout = _pool;
  _pool = STARTING_POOL;
  return payout;
}
