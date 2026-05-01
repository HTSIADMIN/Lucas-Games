// In-memory tracker for the "Lucky Pickaxe" Mines event. Granted at
// game start with a random chance and consumed once per game by the
// player. State lives module-level — Mines games are short-lived
// enough that process restarts don't matter; on a cold start a
// player who hadn't yet used their pickaxe loses it (acceptable for
// a friends-scale casino).

type State = "available" | "used";

const _pickaxes = new Map<string, State>();

/** Base probability multiplier — the chance at the lowest mine
 *  count (1 mine, 24 safe tiles). Scales DOWN linearly as the
 *  player picks more mines: a 23-mine board with only 2 safe
 *  tiles grants the pickaxe at roughly base × (2/24) ≈ 3% so the
 *  free safe reveal can no longer turn a near-impossible board
 *  into a guaranteed cashout. */
export const PICKAXE_BASE_CHANCE = 0.35;

const GRID_TOTAL = 25;

/** Mine-count-aware grant probability. Returns 0 at the 24-mine
 *  MAX board (where one free reveal would auto-win every round). */
export function pickaxeGrantChance(mineCount: number): number {
  if (!Number.isFinite(mineCount) || mineCount < 1 || mineCount >= 24) return 0;
  const safeCount = GRID_TOTAL - mineCount;
  // Linear scale: at 24 safe (1 mine) → BASE; at 1 safe (24 mines) → BASE/24.
  return PICKAXE_BASE_CHANCE * (safeCount / 24);
}

export function grantPickaxe(gameId: string) {
  _pickaxes.set(gameId, "available");
}

export function pickaxeAvailable(gameId: string): boolean {
  return _pickaxes.get(gameId) === "available";
}

/** Atomically claim the pickaxe — returns true once, false on every
 *  subsequent call. */
export function consumePickaxe(gameId: string): boolean {
  if (_pickaxes.get(gameId) !== "available") return false;
  _pickaxes.set(gameId, "used");
  return true;
}

export function clearPickaxe(gameId: string) {
  _pickaxes.delete(gameId);
}
