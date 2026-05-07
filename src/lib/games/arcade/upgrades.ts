// Arcade earn-rate upgrade catalog.
//
// Five tiers per game (crossy_road / flappy / snake). Each level
// adds +25% on top of the base payout. Submit routes look up the
// player's level via getArcadeLevel() and feed the multiplier
// through arcadeMultiplier() before the per-run cap is applied.
// Purchase route consumes ARCADE_UPGRADE_COSTS[level] ¢.

export type ArcadeGame = "crossy_road" | "flappy" | "snake";
export const ARCADE_GAMES: readonly ArcadeGame[] = ["crossy_road", "flappy", "snake"];

/** Cost (in wallet ¢) to advance FROM level (index) TO level (index + 1).
 *  i.e. ARCADE_UPGRADE_COSTS[0] is the price to reach level 1. */
export const ARCADE_UPGRADE_COSTS = [1_000, 2_500, 6_000, 15_000, 40_000] as const;
export const ARCADE_MAX_LEVEL = ARCADE_UPGRADE_COSTS.length;

/** Per-level multiplier applied to score-to-cents payout. Level 0 is
 *  the unmodified baseline; each level above adds +25%. */
export function arcadeMultiplier(level: number): number {
  const lvl = Math.max(0, Math.min(ARCADE_MAX_LEVEL, Math.floor(level)));
  return 1 + 0.25 * lvl;
}

export const ARCADE_GAME_LABEL: Record<ArcadeGame, string> = {
  crossy_road: "Crossy Road",
  flappy: "Flappy",
  snake: "Snake",
};
