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

// ============================================================
// PRESTIGE — Phase 3a
//
// "Roll It Up" wipes session state (cents + helpers + run upgrades)
// and awards Bank Tokens proportional to lifetime PC earned. Tokens
// buy entries in PERM_UPGRADES below — those survive every reset.
// ============================================================

/** Minimum lifetime PC earned before the prestige button unlocks. */
export const PRESTIGE_THRESHOLD_PC = 1_000_000;

/**
 * Soft-curve token formula. We want a casual player who reaches the
 * 1M threshold to get a couple of tokens (motivation), and a
 * dedicated player at 100M to get ~30 — enough to make perm upgrades
 * meaningful without trivialising them.
 *
 *   tokens = floor(sqrt(lifetimePC / 10_000))
 *
 *   1M     →  10 tokens
 *   10M    →  31 tokens
 *   100M   →  100 tokens
 */
export const BANK_TOKEN_DIVISOR = 10_000;

export type PermUpgradeId =
  | "bigger_pockets"
  | "practice_eyes"
  | "vending_lifer"
  | "old_hand"
  | "lucky_streak"
  | "generous_helpers";

export type PermUpgradeDef = {
  id: PermUpgradeId;
  label: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
};

export const PERM_UPGRADES: readonly PermUpgradeDef[] = [
  { id: "bigger_pockets",   label: "Bigger Pockets",   description: "Start each Roll-Up with +1,000 PC already in your pocket per level.",   baseCost: 1, costMultiplier: 1.6, maxLevel: 10 },
  { id: "practice_eyes",    label: "Practice Eyes",    description: "Pennies are worth +5 PC permanently — applies before Penny Multiplier scaling.", baseCost: 3, costMultiplier: 1, maxLevel: 1 },
  { id: "vending_lifer",    label: "Vending Lifer",    description: "Start each Roll-Up with Check Vending Machines already at level 1 (nickels unlocked).", baseCost: 5, costMultiplier: 1, maxLevel: 1 },
  { id: "old_hand",         label: "Old Hand",         description: "Helpers keep generating PC for an extra hour while you're away per level.",        baseCost: 2, costMultiplier: 1.6, maxLevel: 8 },
  { id: "lucky_streak",     label: "Lucky Streak",     description: "+1% permanent shiny-coin chance per level. Stacks with Lucky Sidewalk Crack.",     baseCost: 5, costMultiplier: 1.7, maxLevel: 5 },
  { id: "generous_helpers", label: "Generous Helpers", description: "+25% PC/sec from all helpers per level.",                                          baseCost: 8, costMultiplier: 1.8, maxLevel: 4 },
];

export const PERM_UPGRADES_BY_ID: Record<PermUpgradeId, PermUpgradeDef> = Object.fromEntries(
  PERM_UPGRADES.map((u) => [u.id, u]),
) as Record<PermUpgradeId, PermUpgradeDef>;

// ============================================================
// ACHIEVEMENTS — Phase 3b
//
// One-shot milestones with humour titles. Each pays Bank Tokens
// the first (and only) time the condition is met. State-route
// detects + inserts a row + credits the reward atomically; the
// client just gets back a list of "newly unlocked this fetch" so
// it can pop a toast.
// ============================================================

export type AchievementId =
  | "a_penny_saved"
  | "sidewalk_scholar"
  | "coin_connoisseur"
  | "basically_mining"
  | "goblin_mode"
  | "pile_it_up"
  | "bank_tellers_nightmare"
  | "bigger_boat"
  | "frequent_flyer"
  | "first_million";

export type AchievementDef = {
  id: AchievementId;
  label: string;
  description: string;
  /** Bank Tokens awarded on first unlock. */
  reward: number;
};

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "a_penny_saved",         label: "A Penny Saved",         description: "Pick up your first coin.",                          reward: 1  },
  { id: "sidewalk_scholar",      label: "Sidewalk Scholar",      description: "Pick up 1,000 coins in your career.",               reward: 2  },
  { id: "coin_connoisseur",      label: "Coin Connoisseur",      description: "Pick up 10,000 coins in your career.",              reward: 5  },
  { id: "basically_mining",      label: "This Is Basically Mining", description: "Pick up 100,000 coins in your career.",          reward: 15 },
  { id: "goblin_mode",           label: "Goblin Mode",           description: "Hire the Laundromat Goblin.",                       reward: 3  },
  { id: "pile_it_up",            label: "Pile It Up",            description: "Buy the merging upgrade. Stack 'em.",               reward: 2  },
  { id: "bank_tellers_nightmare",label: "Bank Teller's Nightmare", description: "Roll It Up for the first time.",                 reward: 5  },
  { id: "bigger_boat",           label: "Bigger Boat",           description: "Roll It Up a second time. We're gonna need it.",    reward: 5  },
  { id: "frequent_flyer",        label: "Frequent Flyer",        description: "Roll It Up ten times.",                             reward: 25 },
  { id: "first_million",         label: "First Million",         description: "Bank 1,000,000 ¢ to your wallet across all sessions.", reward: 10 },
];

export const ACHIEVEMENTS_BY_ID: Record<AchievementId, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<AchievementId, AchievementDef>;
