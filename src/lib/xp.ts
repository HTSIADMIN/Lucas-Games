// XP / level system — activity-based, NOT money-based.
//
// History: XP used to be `Math.floor(totalNetWon / 100)` — the more
// coins you'd won, the higher your level. That rewarded the same
// people who already topped the all-time leaderboard, which made
// the LVL badge feel redundant ("of course Michael is L72, he has
// quintillions"). Reworked to reward engagement instead:
//
//   · Each settled game session            → XP_PER_GAME
//   · Each unlocked achievement            → XP_PER_ACHIEVEMENT
//   · Each minute of active play (future)  → XP_PER_PLAY_MINUTE
//
// Play-minute tracking is plumbed through but disabled (multiplier 0)
// because today's data sources — user_sessions duration (inflated by
// long-lived JWTs; sessions span days even when the player isn't
// active) and game_sessions duration (sub-second engine compute, not
// real "play time") — don't measure actual engagement. If we later
// add a 60-second heartbeat ping, just bump XP_PER_PLAY_MINUTE > 0.
//
// Curve is unchanged: cumulative XP for level N is 50 * N * (N+1).
//   L1 needs 100 XP
//   L5 needs 1,500 XP
//   L10 needs 5,500 XP
//   L20 needs 21,000 XP
//   L50 needs 127,500 XP

/** XP awarded per settled game session. Tuned so a heavy-grinder
 *  player who's logged thousands of games reads at L50+ on the
 *  curve, while a casual day-1 player gets to L5-ish in a sitting. */
export const XP_PER_GAME = 25;

/** XP awarded per unlocked achievement. Achievements are sparse
 *  one-shots, so each one's worth ~8 games of grind. */
export const XP_PER_ACHIEVEMENT = 200;

/** XP per minute of active play time. Disabled (0) today — see
 *  module comment. Wire up when a real heartbeat-ping system lands. */
export const XP_PER_PLAY_MINUTE = 0;

export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return 50 * level * (level + 1);
}

export function levelFromXp(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  intoLevelXp: number;
  toNextXp: number;
} {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    intoLevelXp: xp - currentLevelXp,
    toNextXp: nextLevelXp - currentLevelXp,
  };
}

/** Compute total XP from a player's activity counters. Caller
 *  passes whatever inputs they have; missing ones default to 0
 *  so future inputs can be added without breaking callers. */
export function xpFromActivity(input: {
  gamesPlayed?: number;
  achievementsUnlocked?: number;
  playMinutes?: number;
}): number {
  const games = Math.max(0, Math.floor(input.gamesPlayed ?? 0));
  const achievements = Math.max(0, Math.floor(input.achievementsUnlocked ?? 0));
  const minutes = Math.max(0, Math.floor(input.playMinutes ?? 0));
  return (
    games * XP_PER_GAME +
    achievements * XP_PER_ACHIEVEMENT +
    minutes * XP_PER_PLAY_MINUTE
  );
}
