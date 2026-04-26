// Static board config — 20 spaces, 5 tiers.
export type PropertyTier = 1 | 2 | 3 | 4 | 5;

export type Property = {
  id: string;
  name: string;
  tier: PropertyTier;
  basePayout: number;
};

export const BOARD: Property[] = [
  // Tier 1 (4) — base 1k–1.5k
  { id: "cactus_hollow",    name: "Cactus Hollow",       tier: 1, basePayout: 1_000 },
  { id: "tumbleweed",       name: "Tumbleweed Junction", tier: 1, basePayout: 1_200 },
  { id: "coyote_creek",     name: "Coyote Creek",        tier: 1, basePayout: 1_500 },
  { id: "buzzard_bend",     name: "Buzzard Bend",        tier: 1, basePayout: 1_500 },
  // Tier 2 (5) — base 3k–4k
  { id: "old_mill",         name: "Old Mill",            tier: 2, basePayout: 3_000 },
  { id: "sawmill",          name: "Sawmill",             tier: 2, basePayout: 3_000 },
  { id: "trading_post",     name: "Trading Post",        tier: 2, basePayout: 3_500 },
  { id: "mining_camp",      name: "Mining Camp",         tier: 2, basePayout: 4_000 },
  { id: "telegraph",        name: "Telegraph Office",    tier: 2, basePayout: 4_000 },
  // Tier 3 (5) — base 8k–15k
  { id: "stagecoach",       name: "Stagecoach Stop",     tier: 3, basePayout: 8_000 },
  { id: "general_store",    name: "General Store",       tier: 3, basePayout: 9_000 },
  { id: "sheriff_office",   name: "Sheriff's Office",    tier: 3, basePayout: 10_000 },
  { id: "saloon",           name: "Saloon",              tier: 3, basePayout: 12_000 },
  { id: "hotel",            name: "Hotel",               tier: 3, basePayout: 15_000 },
  // Tier 4 (4) — base 20k–35k
  { id: "cattle_ranch",     name: "Cattle Ranch",        tier: 4, basePayout: 20_000 },
  { id: "brewery",          name: "Brewery",             tier: 4, basePayout: 25_000 },
  { id: "silver_mine",      name: "Silver Mine",         tier: 4, basePayout: 28_000 },
  { id: "gold_mine",        name: "Gold Mine",           tier: 4, basePayout: 35_000 },
  // Tier 5 (2) — base 50k+
  { id: "casino",           name: "The Casino",          tier: 5, basePayout: 50_000 },
  { id: "mansion",          name: "Mayor's Mansion",     tier: 5, basePayout: 75_000 },
];

export const BOARD_SIZE = BOARD.length;

export function findProperty(id: string): Property | undefined {
  return BOARD.find((p) => p.id === id);
}

// Multiplier by upgrade level (0 = base, 5 = max).
export const LEVEL_MULTIPLIER = [1, 2, 3, 5, 8, 12] as const;
export const MAX_LEVEL = 5;

export function payoutFor(prop: Property, level: number): number {
  const m = LEVEL_MULTIPLIER[Math.max(0, Math.min(MAX_LEVEL, level))] ?? 1;
  return prop.basePayout * m;
}

// Cards required for the next upgrade (level → cards needed).
export const UPGRADE_CARDS = [2, 3, 4, 5, 6] as const;

// Coin cost per upgrade.
export const UPGRADE_COINS = [5_000, 10_000, 15_000, 25_000, 40_000] as const;

export function nextUpgradeCost(level: number): { cards: number; coins: number } | null {
  if (level >= MAX_LEVEL) return null;
  return { cards: UPGRADE_CARDS[level], coins: UPGRADE_COINS[level] };
}

// Card pack: 5 cards, weighted by tier rarity.
export const PACK_PRICE = 10_000;
export const PACK_SIZE  = 5;

export const TIER_WEIGHT: Record<PropertyTier, number> = {
  1: 35,
  2: 30,
  3: 20,
  4: 12,
  5: 3,
};

// Cooldown between rolls.
export const ROLL_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
