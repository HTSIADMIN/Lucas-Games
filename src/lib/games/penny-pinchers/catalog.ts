// Penny Pinchers — single source of truth for coins, upgrades, and
// helpers. Both the server (cost validation, value computation) and
// the client (rendering, optimistic updates) import from here, so the
// economy stays consistent without duplication.
//
// All currency in this file is "Pinch Cents" (PC) — the in-game
// currency. The wallet ¢ conversion lives on the bank endpoint.

export type CoinId = "penny" | "nickel" | "dime" | "quarter" | "half" | "dollar";

export type CoinDef = {
  id: CoinId;
  label: string;
  /** PC value before any value-upgrade modifiers. */
  basePC: number;
  /** Hex tint used by the client renderer. */
  color: string;
  /** Edge / outline tint. */
  edge: string;
};

export const COINS: Record<CoinId, CoinDef> = {
  penny:   { id: "penny",   label: "Penny",       basePC: 1,   color: "#c87a3a", edge: "#7a4a23" },
  nickel:  { id: "nickel",  label: "Nickel",      basePC: 5,   color: "#a8a8a8", edge: "#5a5a5a" },
  dime:    { id: "dime",    label: "Dime",        basePC: 10,  color: "#bcbcbc", edge: "#666666" },
  quarter: { id: "quarter", label: "Quarter",     basePC: 25,  color: "#d4d4d4", edge: "#7a7a7a" },
  half:    { id: "half",    label: "Half Dollar", basePC: 50,  color: "#e0e0e0", edge: "#888888" },
  dollar:  { id: "dollar",  label: "Dollar Coin", basePC: 100, color: "#e8c468", edge: "#7a5510" },
};

export const COIN_ORDER: readonly CoinId[] = ["penny", "nickel", "dime", "quarter", "half", "dollar"] as const;

// ============================================================
// UPGRADES
// ============================================================

export type UpgradeCategory = "click" | "value" | "spawn" | "automation";

export type UpgradeId =
  | "sharper_eyes"
  | "two_finger_pickup"
  | "penny_multiplier"
  | "lucky_crack"
  | "vending_machines"
  | "parking_lot"
  | "laundry_day"
  | "boardwalk"
  | "grandpa_jar"
  | "auto_picker"
  | "pile_it_up";

export type UpgradeDef = {
  id: UpgradeId;
  label: string;
  description: string;
  category: UpgradeCategory;
  baseCost: number;
  /** Cost at level N is `baseCost * costMultiplier^N`. */
  costMultiplier: number;
  maxLevel: number;
  /**
   * If set, this upgrade is unlocked at level 1 (single-purchase
   * gate); subsequent levels (up to maxLevel) bump the unlocked
   * coin's spawn weight.
   */
  unlocksCoin?: CoinId;
};

export const UPGRADES: readonly UpgradeDef[] = [
  // Click — make manual play feel better
  { id: "sharper_eyes",      label: "Sharper Eyes",        description: "Coins spawn 5% faster per level.",                category: "click",      baseCost: 25,    costMultiplier: 1.55, maxLevel: 10 },
  { id: "two_finger_pickup", label: "Two-Finger Pickup",   description: "Each click has a +5% chance to grab a nearby coin.", category: "click",   baseCost: 200,   costMultiplier: 1.65, maxLevel: 10 },

  // Value — make coins worth more
  { id: "penny_multiplier",  label: "Penny Multiplier",    description: "+1 PC on every penny per level.",                  category: "value",      baseCost: 50,    costMultiplier: 1.45, maxLevel: 20 },
  { id: "lucky_crack",       label: "Lucky Sidewalk Crack", description: "+1% chance per level for a coin to spawn shiny (5×).", category: "value",  baseCost: 500,   costMultiplier: 1.7,  maxLevel: 10 },

  // Spawn — unlock new coin tiers, then pump their weight
  { id: "vending_machines",  label: "Check Vending Machines", description: "Adds nickels to the spawn pool. Higher levels make them more common.", category: "spawn", baseCost: 250,    costMultiplier: 2.0, maxLevel: 5, unlocksCoin: "nickel" },
  { id: "parking_lot",       label: "Parking Lot Sweep",      description: "Adds dimes. Higher levels = more common.",          category: "spawn",  baseCost: 2_500,  costMultiplier: 2.2, maxLevel: 5, unlocksCoin: "dime" },
  { id: "laundry_day",       label: "Laundry Day Jackpot",    description: "Adds quarters. Higher levels = more common.",       category: "spawn",  baseCost: 25_000, costMultiplier: 2.4, maxLevel: 5, unlocksCoin: "quarter" },
  { id: "boardwalk",         label: "Boardwalk Tip Jar",      description: "Adds half dollars. Higher levels = more common.",   category: "spawn",  baseCost: 250_000, costMultiplier: 2.5, maxLevel: 5, unlocksCoin: "half" },
  { id: "grandpa_jar",       label: "Grandpa's Coin Jar",     description: "Adds rare dollar coins. Higher levels = more common.", category: "spawn", baseCost: 2_500_000, costMultiplier: 2.7, maxLevel: 5, unlocksCoin: "dollar" },

  // Automation foundation
  { id: "auto_picker",       label: "Auto-Picker",            description: "Auto-clicks a random coin once per second per level.", category: "automation", baseCost: 5_000, costMultiplier: 3.0, maxLevel: 5 },

  // Merging — strategic-wait mechanic. Once unlocked, coins that
  // sit too close to each other auto-fuse into the next denomination.
  { id: "pile_it_up",        label: "Pile It Up",             description: "Coins left near each other merge into bigger ones. 5 pennies → nickel; 2 nickels → dime.", category: "automation", baseCost: 500, costMultiplier: 1.0, maxLevel: 1 },
];

export const UPGRADES_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;

// ============================================================
// HELPERS — passive PC/sec generators
// ============================================================

export type HelperId = "grandma_purse" | "couch_diver" | "meter_inspector" | "laundry_goblin";

export type HelperDef = {
  id: HelperId;
  label: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  /** PC produced per second per copy owned. */
  pcPerSec: number;
  maxOwn: number;
};

export const HELPERS: readonly HelperDef[] = [
  { id: "grandma_purse",   label: "Grandma's Change Purse", description: "Generates pennies forever. Cheap entry-level autopilot.", baseCost: 100,    costMultiplier: 1.4, pcPerSec: 0.5, maxOwn: 25 },
  { id: "couch_diver",     label: "Couch Diver",            description: "Pulls a coin out of the cushions every second.",           baseCost: 1_000,  costMultiplier: 1.5, pcPerSec: 1,   maxOwn: 25 },
  { id: "meter_inspector", label: "Parking Meter Inspector", description: "Sweeps the meters. Solid mid-game generator.",             baseCost: 10_000, costMultiplier: 1.6, pcPerSec: 5,   maxOwn: 25 },
  { id: "laundry_goblin",  label: "Laundromat Goblin",      description: "Occasionally dumps a pile of quarters.",                   baseCost: 100_000, costMultiplier: 1.7, pcPerSec: 15,  maxOwn: 25 },
];

export const HELPERS_BY_ID: Record<HelperId, HelperDef> = Object.fromEntries(
  HELPERS.map((h) => [h.id, h]),
) as Record<HelperId, HelperDef>;

// ============================================================
// ECONOMY CONSTANTS — wallet payout shape
// ============================================================

/** PC required for 1 wallet ¢ on Bank It. */
export const BANK_PC_PER_WALLET_CENT = 4;
/** Minimum cooldown between bank actions, milliseconds. */
export const BANK_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
/** Cap on a single bank's wallet payout (¢). */
export const MAX_BANK_PAYOUT = 25_000;
/** Cap on total wallet payouts per UTC day. */
export const DAILY_BANK_CAP = 100_000;

/** How much PC stays in the player's pocket after banking. */
export const BANK_HOUSE_CUT = 0; // 0 = bank everything; raise later if we want a residual

// ============================================================
// RARE COIN TRAITS — Phase 2a
//
// Spawned coins occasionally roll a trait that changes how they
// look and what they pay. Server caps apply on click (see
// click/route.ts) so even if the client lies the player can't
// dump unlimited PC.
// ============================================================

export type CoinTrait = "shiny" | "sticky";

export type TraitDef = {
  id: CoinTrait;
  /** PC multiplier applied on collect. Server clamps to this max. */
  maxMultiplier: number;
  /** Spawn probability before any luck modifiers. */
  baseChance: number;
  /** Each level of `lucky_crack` adds this much to the chance. */
  perLuckLevel: number;
  label: string;
};

export const TRAITS: Record<CoinTrait, TraitDef> = {
  shiny:  { id: "shiny",  maxMultiplier: 5, baseChance: 0.01, perLuckLevel: 0.01, label: "Shiny" },
  // Sticky doesn't multiply value — it picks up nearby coins on
  // click (handled client-side). Multiplier of 1 is the cap.
  sticky: { id: "sticky", maxMultiplier: 1, baseChance: 0.005, perLuckLevel: 0.003, label: "Sticky" },
};

/** Number of nearby coins a sticky-click also picks up. */
export const STICKY_PICKUP_COUNT = 2;
/** Sticky-click radius (px in play area). */
export const STICKY_PICKUP_RADIUS = 140;

// ============================================================
// MERGING — Phase 2a
//
// When the `pile_it_up` upgrade is owned, coins of the same
// denomination that have been on screen for at least
// MERGE_MIN_AGE_MS auto-fuse into the next tier when enough are
// within MERGE_PROXIMITY_PX of each other. Pure client-side cosmetic
// — server still values clicked coins normally.
// ============================================================

export const MERGE_PROXIMITY_PX = 110;
export const MERGE_MIN_AGE_MS = 1500;

export type MergeRule = { from: CoinId; count: number; to: CoinId };

export const MERGE_RULES: readonly MergeRule[] = [
  { from: "penny",   count: 5, to: "nickel"  },
  { from: "nickel",  count: 2, to: "dime"    },
  { from: "dime",    count: 5, to: "half"    },
  { from: "quarter", count: 2, to: "half"    },
  { from: "half",    count: 2, to: "dollar"  },
];

// ============================================================
// CLICK / OFFLINE LIMITS
// ============================================================

/** Max clicks/sec the server will credit (sliding-window guard). */
export const MAX_CLICKS_PER_SEC = 25;
/** Helper offline accrual is capped at this many hours of last-tick gap. */
export const OFFLINE_CAP_HOURS = 8;
