// Static board config — 36 spaces arranged as a 10x10 perimeter ring.
// 4 corners + 32 edge spaces (24 properties + 4 reroll + 4 mystery).

export type PropertyTier = 1 | 2 | 3 | 4 | 5;

export type Property = {
  id: string;
  name: string;
  tier: PropertyTier;
  basePayout: number;
};

export type SpaceType =
  | { kind: "property"; property: Property }
  | { kind: "reroll" }
  | { kind: "mystery" }
  | { kind: "go" }
  | { kind: "free_parking" };

const P: Record<string, Property> = {
  // Tier 1 (6)
  cactus_hollow:    { id: "cactus_hollow",    name: "Cactus Hollow",       tier: 1, basePayout: 1_000 },
  tumbleweed:       { id: "tumbleweed",       name: "Tumbleweed Junction", tier: 1, basePayout: 1_200 },
  coyote_creek:     { id: "coyote_creek",     name: "Coyote Creek",        tier: 1, basePayout: 1_500 },
  buzzard_bend:     { id: "buzzard_bend",     name: "Buzzard Bend",        tier: 1, basePayout: 1_500 },
  boomtown:         { id: "boomtown",         name: "Boomtown",            tier: 1, basePayout: 1_800 },
  crossroads:       { id: "crossroads",       name: "Crossroads",          tier: 1, basePayout: 2_000 },
  // Tier 2 (6)
  old_mill:         { id: "old_mill",         name: "Old Mill",            tier: 2, basePayout: 3_000 },
  sawmill:          { id: "sawmill",          name: "Sawmill",             tier: 2, basePayout: 3_000 },
  trading_post:     { id: "trading_post",     name: "Trading Post",        tier: 2, basePayout: 3_500 },
  mining_camp:      { id: "mining_camp",      name: "Mining Camp",         tier: 2, basePayout: 4_000 },
  telegraph:        { id: "telegraph",        name: "Telegraph Office",    tier: 2, basePayout: 4_500 },
  whiskey_row:      { id: "whiskey_row",      name: "Whiskey Row",         tier: 2, basePayout: 5_000 },
  // Tier 3 (6)
  stagecoach:       { id: "stagecoach",       name: "Stagecoach Stop",     tier: 3, basePayout: 8_000 },
  general_store:    { id: "general_store",    name: "General Store",       tier: 3, basePayout: 9_000 },
  sheriff_office:   { id: "sheriff_office",   name: "Sheriff's Office",    tier: 3, basePayout: 10_000 },
  saloon:           { id: "saloon",           name: "Saloon",              tier: 3, basePayout: 12_000 },
  hotel:            { id: "hotel",            name: "Hotel",               tier: 3, basePayout: 15_000 },
  frontier_bank:    { id: "frontier_bank",    name: "Frontier Bank",       tier: 3, basePayout: 18_000 },
  // Tier 4 (4)
  cattle_ranch:     { id: "cattle_ranch",     name: "Cattle Ranch",        tier: 4, basePayout: 25_000 },
  brewery:          { id: "brewery",          name: "Brewery",             tier: 4, basePayout: 30_000 },
  silver_mine:      { id: "silver_mine",      name: "Silver Mine",         tier: 4, basePayout: 35_000 },
  gold_mine:        { id: "gold_mine",        name: "Gold Mine",           tier: 4, basePayout: 45_000 },
  // Tier 5 (2)
  casino:           { id: "casino",           name: "The Casino",          tier: 5, basePayout: 75_000 },
  mansion:          { id: "mansion",          name: "Mayor's Mansion",     tier: 5, basePayout: 100_000 },
};

export const PROPERTIES = Object.values(P);

// 36-space ring layout, walking clockwise.
// Corners: 0=GO (top-left), 9=Mystery (top-right),
//          18=Free Parking (bottom-right), 27=Reroll (bottom-left).
export const BOARD: SpaceType[] = [
  /* 0  */ { kind: "go" },
  /* 1  */ { kind: "property", property: P.cactus_hollow },
  /* 2  */ { kind: "reroll" },
  /* 3  */ { kind: "property", property: P.tumbleweed },
  /* 4  */ { kind: "property", property: P.old_mill },
  /* 5  */ { kind: "mystery" },
  /* 6  */ { kind: "property", property: P.sawmill },
  /* 7  */ { kind: "property", property: P.mansion },
  /* 8  */ { kind: "property", property: P.coyote_creek },
  /* 9  */ { kind: "mystery" },
  /* 10 */ { kind: "property", property: P.trading_post },
  /* 11 */ { kind: "property", property: P.buzzard_bend },
  /* 12 */ { kind: "reroll" },
  /* 13 */ { kind: "property", property: P.mining_camp },
  /* 14 */ { kind: "property", property: P.stagecoach },
  /* 15 */ { kind: "mystery" },
  /* 16 */ { kind: "property", property: P.general_store },
  /* 17 */ { kind: "property", property: P.cattle_ranch },
  /* 18 */ { kind: "free_parking" },
  /* 19 */ { kind: "property", property: P.sheriff_office },
  /* 20 */ { kind: "property", property: P.telegraph },
  /* 21 */ { kind: "reroll" },
  /* 22 */ { kind: "property", property: P.saloon },
  /* 23 */ { kind: "property", property: P.brewery },
  /* 24 */ { kind: "mystery" },
  /* 25 */ { kind: "property", property: P.casino },
  /* 26 */ { kind: "property", property: P.hotel },
  /* 27 */ { kind: "reroll" },
  /* 28 */ { kind: "property", property: P.silver_mine },
  /* 29 */ { kind: "property", property: P.frontier_bank },
  /* 30 */ { kind: "reroll" },
  /* 31 */ { kind: "property", property: P.gold_mine },
  /* 32 */ { kind: "mystery" },
  /* 33 */ { kind: "property", property: P.boomtown },
  /* 34 */ { kind: "property", property: P.whiskey_row },
  /* 35 */ { kind: "property", property: P.crossroads },
];

export const BOARD_SIZE = BOARD.length;

// Map board position → grid cell on a 10x10 ring.
export function gridPos(i: number): { row: number; col: number } {
  if (i < 10) return { row: 0, col: i };
  if (i < 19) return { row: i - 9, col: 9 };
  if (i < 28) return { row: 9, col: 27 - i };
  return { row: 36 - i, col: 0 };
}

export function findProperty(id: string): Property | undefined {
  return P[id];
}

export function findSpaceWithProperty(id: string): number {
  return BOARD.findIndex((s) => s.kind === "property" && s.property.id === id);
}

// Multiplier by upgrade level (0 = base, 5 = max).
export const LEVEL_MULTIPLIER = [1, 2, 3, 5, 8, 12] as const;
export const MAX_LEVEL = 5;

export function payoutFor(prop: Property, level: number): number {
  const m = LEVEL_MULTIPLIER[Math.max(0, Math.min(MAX_LEVEL, level))] ?? 1;
  return prop.basePayout * m;
}

export const UPGRADE_CARDS = [2, 3, 4, 5, 6] as const;
export const UPGRADE_COINS = [5_000, 10_000, 15_000, 25_000, 40_000] as const;

export function nextUpgradeCost(level: number): { cards: number; coins: number } | null {
  if (level >= MAX_LEVEL) return null;
  return { cards: UPGRADE_CARDS[level], coins: UPGRADE_COINS[level] };
}

export const PACK_PRICE = 10_000;
export const PACK_SIZE  = 5;
export const TIER_WEIGHT: Record<PropertyTier, number> = {
  1: 35,
  2: 30,
  3: 20,
  4: 12,
  5: 3,
};

// Tiered pack catalog. Each pack pulls 5 cards from a different
// rarity distribution; expensive packs drop their lowest-tier
// weights to zero so paying more meaningfully changes what you can
// pull. Drifter is the legacy 10k pack (kept identical for
// compatibility). Tycoon is mostly T4 with a real shot at T5.
export type MonopolyPackId = "drifter" | "prospector" | "outlaw" | "tycoon";

export type MonopolyPackSpec = {
  id: MonopolyPackId;
  name: string;
  blurb: string;
  price: number;
  size: number;
  /** Weight per tier. Tiers with weight 0 are excluded entirely. */
  weights: Record<PropertyTier, number>;
};

export const MONOPOLY_PACKS: Record<MonopolyPackId, MonopolyPackSpec> = {
  drifter: {
    id: "drifter",
    name: "Drifter Pack",
    blurb: "5 cards · all tiers possible.",
    price: 10_000,
    size: 5,
    weights: { 1: 35, 2: 30, 3: 20, 4: 12, 5: 3 },
  },
  prospector: {
    id: "prospector",
    name: "Prospector Pack",
    blurb: "5 cards · no Tier 1; weighted to T2/T3.",
    price: 35_000,
    size: 5,
    weights: { 1: 0, 2: 38, 3: 35, 4: 22, 5: 5 },
  },
  outlaw: {
    id: "outlaw",
    name: "Outlaw Pack",
    blurb: "5 cards · Tier 3 minimum; chunky T4 odds.",
    price: 90_000,
    size: 5,
    weights: { 1: 0, 2: 0, 3: 50, 4: 40, 5: 10 },
  },
  tycoon: {
    id: "tycoon",
    name: "Tycoon Pack",
    blurb: "5 cards · Tier 4 minimum; real shot at Tier 5.",
    price: 250_000,
    size: 5,
    weights: { 1: 0, 2: 0, 3: 0, 4: 70, 5: 30 },
  },
};

export const MONOPOLY_PACK_ORDER: MonopolyPackId[] = ["drifter", "prospector", "outlaw", "tycoon"];

/** Per-slot trade-in fraction of the pack's per-slot cost when the
 *  rolled property is already at MAX_LEVEL. Scales by tier so a
 *  would-have-been-T5 slot pays back more than a T1. Tuned with the
 *  per-slot price so a fully-maxed Tycoon pack returns ~70% of its
 *  cost while a fully-maxed Drifter returns ~35% — meaningful
 *  refund at every tier without becoming a coin-mining loop. */
export const MAXED_TRADEIN_FRACTION: Record<PropertyTier, number> = {
  1: 0.20,
  2: 0.30,
  3: 0.45,
  4: 0.65,
  5: 0.85,
};

export function tradeInForMonopolySlot(spec: MonopolyPackSpec, tier: PropertyTier): number {
  const perSlot = spec.price / Math.max(1, spec.size);
  return Math.floor(perSlot * (MAXED_TRADEIN_FRACTION[tier] ?? 0));
}

export const ROLL_COOLDOWN_MS = 60 * 60 * 1000;

// Corner payouts
export const GO_PAYOUT = 5_000;
export const FREE_PARKING_PAYOUT = 2_000;

// Mystery card pool — server picks one weighted-randomly when player lands on a mystery.
export type MysteryCard =
  | { kind: "coins";     amount: number;            label: string }
  | { kind: "pay";       amount: number;            label: string }
  | { kind: "card";      tier: PropertyTier;        label: string }
  | { kind: "goto";      propertyId: string;        label: string }
  | { kind: "free_roll";                            label: string };

export const MYSTERY_DECK: { weight: number; card: MysteryCard }[] = [
  { weight: 14, card: { kind: "coins", amount: 5_000,  label: "Lucky strike! +5,000 ¢" } },
  { weight: 10, card: { kind: "coins", amount: 15_000, label: "Found a stash! +15,000 ¢" } },
  { weight: 4,  card: { kind: "coins", amount: 50_000, label: "Hit the jackpot! +50,000 ¢" } },
  { weight: 10, card: { kind: "pay",   amount: 5_000,  label: "Saloon tab. -5,000 ¢" } },
  { weight: 6,  card: { kind: "pay",   amount: 15_000, label: "Stagecoach robbery! -15,000 ¢" } },
  { weight: 12, card: { kind: "card",  tier: 1,        label: "Found a deed! +1 Tier 1 card" } },
  { weight: 8,  card: { kind: "card",  tier: 2,        label: "Found a deed! +1 Tier 2 card" } },
  { weight: 5,  card: { kind: "card",  tier: 3,        label: "Found a deed! +1 Tier 3 card" } },
  { weight: 2,  card: { kind: "card",  tier: 4,        label: "Rare deed! +1 Tier 4 card" } },
  { weight: 1,  card: { kind: "card",  tier: 5,        label: "Legendary deed! +1 Tier 5 card" } },
  { weight: 6,  card: { kind: "goto",  propertyId: "saloon", label: "Off to the Saloon!" } },
  { weight: 4,  card: { kind: "goto",  propertyId: "casino", label: "Lured to the Casino!" } },
  { weight: 8,  card: { kind: "free_roll", label: "Roll again on the house!" } },
];
