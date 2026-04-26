// XP curve: 1 XP per 100 Coins wagered (any "_bet" reason or crash_bet).
// Level N requires triangular cumulative XP: 50 * N * (N + 1).
//   L1 needs 100 XP   (10k wagered)
//   L5 needs 1500 XP  (150k wagered)
//   L10 needs 5500 XP
//   L20 needs 21000 XP
//   L50 needs 127500 XP

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

const COIN_PER_XP = 100;

export function xpFromCoinsWagered(coins: number): number {
  return Math.floor(coins / COIN_PER_XP);
}
