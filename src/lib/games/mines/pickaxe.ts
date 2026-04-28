// In-memory tracker for the "Lucky Pickaxe" Mines event. Granted at
// game start with a random chance and consumed once per game by the
// player. State lives module-level — Mines games are short-lived
// enough that process restarts don't matter; on a cold start a
// player who hadn't yet used their pickaxe loses it (acceptable for
// a friends-scale casino).

type State = "available" | "used";

const _pickaxes = new Map<string, State>();

/** Probability per fresh Mines game that a Lucky Pickaxe is granted. */
export const PICKAXE_GRANT_CHANCE = 0.30;

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
