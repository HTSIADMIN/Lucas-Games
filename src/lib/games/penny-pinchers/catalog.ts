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
  | "coin_polish"
  | "lucky_crack"
  | "vending_machines"
  | "parking_lot"
  | "laundry_day"
  | "boardwalk"
  | "grandpa_jar"
  | "auto_picker"
  | "pile_it_up"
  | "extra_hands";

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
  /**
   * When true, the Higher Ceilings perm upgrade does NOT extend this
   * upgrade's max level. Used for binary unlocks (Pile It Up — owning
   * it twice does nothing).
   */
  ceilingExempt?: boolean;
  /**
   * Explicit per-level cost ladder. When set, overrides
   * baseCost / costMultiplier — index 0 is the cost for L1, index N
   * is the cost for L(N+1). Used by short capped upgrades whose
   * authored ramp doesn't fit a clean geometric formula.
   */
  costSchedule?: readonly number[];
};

export const UPGRADES: readonly UpgradeDef[] = [
  // Click — make manual play feel better
  { id: "sharper_eyes",      label: "Sharper Eyes",        description: "Coins spawn 5% faster per level.",                category: "click",      baseCost: 25,    costMultiplier: 1.55, maxLevel: 10 },
  { id: "two_finger_pickup", label: "Two-Finger Pickup",   description: "Each click has a +5% chance to grab a nearby coin.", category: "click",   baseCost: 200,   costMultiplier: 1.65, maxLevel: 10 },

  // Value — make coins worth more
  // Replaces the old flat-+1-PC "Penny Multiplier" — that one
  // disproportionately boosted pennies (penny went 1 → 21 at lv20
  // while a dollar only went 100 → 120). Now scales every coin's
  // base value by +10% per level instead, so the relative pecking
  // order between denominations is preserved.
  // Same upgrade_id retained so existing per-user rows carry over
  // their level on deploy.
  { id: "penny_multiplier",  label: "Coin Value",          description: "+10% PC on every coin per level — keeps the denominations in proportion.", category: "value", baseCost: 50, costMultiplier: 1.45, maxLevel: 20 },
  // Flat-bonus counterpart to Coin Value. Cheap starter — 25 PC for
  // the first level so a player can stack a couple of +1's right
  // away — but ramps fast at the top (last rank is 1k). Capped at
  // 5 and exempt from Higher Ceilings — a hard ceiling so a tiny
  // denomination (penny) can't be turned into a power-fountain by
  // stacking +1's. costSchedule overrides the geometric formula.
  { id: "coin_polish",       label: "Coin Polish",         description: "+1 PC on every coin per level. Hard cap at 5.", category: "value", baseCost: 25, costMultiplier: 1, maxLevel: 5, ceilingExempt: true, costSchedule: [25, 50, 200, 500, 1000] },
  { id: "lucky_crack",       label: "Lucky Sidewalk Crack", description: "+1% chance per level for a coin to spawn shiny (5×).", category: "value",  baseCost: 500,   costMultiplier: 1.7,  maxLevel: 10 },

  // Spawn — unlock new coin tiers, then pump their weight. Marked
  // ceilingExempt because the per-level weight bump is flat (+10
  // nickel, +7 dime, etc) while the cost compounds geometrically;
  // anything past lvl 5 is a deeply diminishing-return bloat.
  // Higher Ceilings stays useful elsewhere — Coin Value, Sharper
  // Eyes, Lucky Crack, Two-Finger, Extra Hands, Auto-Picker.
  { id: "vending_machines",  label: "Check Vending Machines", description: "Adds nickels to the spawn pool. Higher levels make them more common.", category: "spawn", baseCost: 250,    costMultiplier: 2.0, maxLevel: 5, unlocksCoin: "nickel",  ceilingExempt: true },
  { id: "parking_lot",       label: "Parking Lot Sweep",      description: "Adds dimes. Higher levels = more common.",          category: "spawn",  baseCost: 2_500,  costMultiplier: 2.2, maxLevel: 5, unlocksCoin: "dime",    ceilingExempt: true },
  { id: "laundry_day",       label: "Laundry Day Jackpot",    description: "Adds quarters. Higher levels = more common.",       category: "spawn",  baseCost: 25_000, costMultiplier: 2.4, maxLevel: 5, unlocksCoin: "quarter", ceilingExempt: true },
  { id: "boardwalk",         label: "Boardwalk Tip Jar",      description: "Adds half dollars. Higher levels = more common.",   category: "spawn",  baseCost: 250_000, costMultiplier: 2.5, maxLevel: 5, unlocksCoin: "half",    ceilingExempt: true },
  { id: "grandpa_jar",       label: "Grandpa's Coin Jar",     description: "Adds rare dollar coins. Higher levels = more common.", category: "spawn", baseCost: 2_500_000, costMultiplier: 2.7, maxLevel: 5, unlocksCoin: "dollar", ceilingExempt: true },

  // Automation foundation
  { id: "auto_picker",       label: "Auto-Picker",            description: "Auto-clicks a random coin once per second per level.", category: "automation", baseCost: 5_000, costMultiplier: 3.0, maxLevel: 5 },

  // Merging — strategic-wait mechanic. Once unlocked, ANY two
  // coins that sit close to each other auto-fuse into a single
  // coin whose value is the sum of both — chains keep growing
  // until something despawns or you click them.
  { id: "pile_it_up",        label: "Pile It Up",             description: "Coins near each other auto-merge into a single bigger coin (sums their value, resets the timer). Chains can grow huge.", category: "automation", baseCost: 500, costMultiplier: 1.0, maxLevel: 1, ceilingExempt: true },

  // Extra Hands — chance for a bonus coin alongside each spawn.
  { id: "extra_hands",       label: "Extra Hands",            description: "+5% chance per level that each spawn drops an extra coin alongside it.", category: "spawn", baseCost: 350, costMultiplier: 1.6, maxLevel: 10 },
];

export const UPGRADES_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;

// ============================================================
// HELPERS — passive PC/sec generators
// ============================================================

export type HelperId =
  | "grandma_purse"
  | "couch_diver"
  | "meter_inspector"
  | "laundry_goblin"
  | "night_watch"
  | "pawnbroker"
  | "coin_diviner";

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

// Payback per tier ≈ 200 s (baseCost / pcPerSec = 200). Each tier
// is ~10× the cost of the previous AND ~10× the output, so "the
// money they generate scales with what they cost" — a late-game
// helper is no worse a deal than an early-game one. Cost
// multiplier ramps gently (1.4 → 2.0) so longer-running lines
// still feel like they ramp into a wall eventually.
export const HELPERS: readonly HelperDef[] = [
  { id: "grandma_purse",   label: "Grandma's Change Purse",  description: "Pulls warm pennies out of an old vinyl coin purse. Cheap entry-level autopilot.", baseCost: 100,         costMultiplier: 1.4, pcPerSec: 0.5,     maxOwn: 25 },
  { id: "couch_diver",     label: "Couch Diver",             description: "Hands deep between every cushion in town.",                                        baseCost: 1_000,       costMultiplier: 1.5, pcPerSec: 5,       maxOwn: 25 },
  { id: "meter_inspector", label: "Parking Meter Inspector", description: "Walks the meters every day. Solid mid-game generator.",                            baseCost: 10_000,      costMultiplier: 1.6, pcPerSec: 50,      maxOwn: 25 },
  { id: "laundry_goblin",  label: "Laundromat Goblin",       description: "Empties forgotten quarters out of every dryer on the strip.",                      baseCost: 100_000,     costMultiplier: 1.7, pcPerSec: 500,     maxOwn: 25 },
  { id: "night_watch",     label: "Night-Watch Sweeper",     description: "Keys to every shop after closing — bigger bills, fewer witnesses.",                baseCost: 1_000_000,   costMultiplier: 1.8, pcPerSec: 5_000,   maxOwn: 25 },
  { id: "pawnbroker",      label: "Pawnbroker",              description: "Runs the dusty shop on Main Street. Flips coin collections for clean profit.",     baseCost: 10_000_000,  costMultiplier: 1.9, pcPerSec: 50_000,  maxOwn: 25 },
  { id: "coin_diviner",    label: "Coin Diviner",            description: "Dowses for buried piles in the foothills. Supernatural payouts, slow steps.",      baseCost: 100_000_000, costMultiplier: 2.0, pcPerSec: 500_000, maxOwn: 25 },
];

export const HELPERS_BY_ID: Record<HelperId, HelperDef> = Object.fromEntries(
  HELPERS.map((h) => [h.id, h]),
) as Record<HelperId, HelperDef>;

// ============================================================
// ECONOMY CONSTANTS — wallet payout shape
// ============================================================

/** PC required for 1 wallet ¢ on Bank It. */
export const BANK_PC_PER_WALLET_CENT = 4;

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

export type CoinTrait =
  | "shiny"
  | "sticky"
  | "bent"
  | "foreign"
  | "ancient"
  | "cursed"
  | "lightning"
  | "frosted"
  | "lucky";

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
  shiny:   { id: "shiny",   maxMultiplier: 5,  baseChance: 0.012, perLuckLevel: 0.01,  label: "Shiny"   },
  // Sticky doesn't multiply value — it picks up nearby coins on
  // click (handled client-side). Multiplier of 1 is the cap.
  sticky:  { id: "sticky",  maxMultiplier: 1,  baseChance: 0.005, perLuckLevel: 0.003, label: "Sticky"  },
  // Bent: half value but lights a 5s "Lucky Window" client-side
  // that boosts the next spawn rolls' shiny chance by +10%.
  bent:    { id: "bent",    maxMultiplier: 1,  baseChance: 0.012, perLuckLevel: 0.005, label: "Bent"    },
  // Foreign: normal value, but each pickup goes into the Foreign
  // album page for a permanent PC bonus when filled.
  foreign: { id: "foreign", maxMultiplier: 1,  baseChance: 0.006, perLuckLevel: 0.003, label: "Foreign" },
  // Ancient: extremely rare, 50× payout, no other effect.
  ancient: { id: "ancient", maxMultiplier: 50, baseChance: 0.0005, perLuckLevel: 0.0003, label: "Ancient" },
  // Cursed: 3× value but pauses spawns for 5s after collecting.
  cursed:    { id: "cursed",    maxMultiplier: 3,  baseChance: 0.004,  perLuckLevel: 0.001,  label: "Cursed"    },
  // Lightning: 8× pay AND a guaranteed chain-grab to one nearby
  // coin within LIGHTNING_RADIUS — like a guaranteed Two-Finger.
  lightning: { id: "lightning", maxMultiplier: 8,  baseChance: 0.003,  perLuckLevel: 0.001,  label: "Lightning" },
  // Frosted: 2× pay; coin sits on screen FROSTED_LIFETIME_BONUS_MS
  // longer so you have more time to merge or click it.
  frosted:   { id: "frosted",   maxMultiplier: 2,  baseChance: 0.008,  perLuckLevel: 0.003,  label: "Frosted"   },
  // Lucky: 4× pay; on click, opens an 8s window with +20% shiny
  // chance (stronger sibling of Bent's lucky window).
  lucky:     { id: "lucky",     maxMultiplier: 4,  baseChance: 0.005,  perLuckLevel: 0.002,  label: "Lucky"     },
};

/** Signature colour per trait — single source of truth used by the
 *  CoinSprite multi-trait dot pill, the AlbumPanel page accent, and
 *  any future UI that needs to brand a trait visually. */
export const TRAIT_COLOR: Record<CoinTrait, string> = {
  shiny:     "#f5c842",
  ancient:   "#5fa17a",
  cursed:    "#dc5050",
  foreign:   "#5fa8d3",
  bent:      "#a0a0a0",
  sticky:    "#ff82c8",
  lightning: "#ffe14d",
  frosted:   "#9adcff",
  lucky:     "#ff9a3c",
};

/** Bent's lucky-window duration after click. */
export const BENT_LUCKY_MS = 5_000;
/** Bent's flat shiny boost during the lucky window. */
export const BENT_LUCKY_SHINY_BOOST = 0.10;
/** Cursed's spawn-pause duration after click. */
export const CURSED_PAUSE_MS = 5_000;
/** Lucky's stronger lucky-window — longer + bigger shiny boost. */
export const LUCKY_DURATION_MS = 8_000;
export const LUCKY_SHINY_BOOST = 0.20;
/** Lightning's chain-grab radius (px) — wider than Two-Finger. */
export const LIGHTNING_RADIUS = 220;
/** Frosted coins last this much longer on screen than the default
 *  COIN_LIFETIME_MS (declared in the client). */
export const FROSTED_LIFETIME_BONUS_MS = 3_000;

/** Number of nearby coins a sticky-click also picks up. */
export const STICKY_PICKUP_COUNT = 2;
/** Sticky-click radius (px in play area). */
export const STICKY_PICKUP_RADIUS = 140;

/** Two-Finger Pickup radius (px). Only triggers on the upgrade roll. */
export const TWO_FINGER_RADIUS = 110;
/** Per-second auto-clicks per level of Auto-Picker. */
export const AUTO_PICKER_PER_SEC = 1;

// ============================================================
// MERGING — Phase 2a (incremental rewrite Phase 3.5)
//
// When the `pile_it_up` upgrade is owned, ANY two coins within
// MERGE_PROXIMITY_PX of each other auto-fuse into a single coin
// whose PC value is the sum of both inputs. The fused coin's
// lifetime timer resets, so chains can keep growing. Chains pay
// out via an optional `pc` field on the click endpoint, server-
// clamped to MAX_CLICK_PC so a tampered client can't dump a
// trillion-PC click.
// ============================================================

export const MERGE_PROXIMITY_PX = 90;
export const MERGE_MIN_AGE_MS = 800;

/** Server-side clamp on the per-click PC payout for merged coins. */
export const MAX_CLICK_PC = 5_000;

// ============================================================
// PINCH STREAK — Phase 3.5
//
// Click cadence is tracked in a sliding window; the more clicks
// you land within the window, the more bonus PC each subsequent
// click pays — up to a "Money Frenzy" tier where PC is doubled
// AND coins rain. Server respects the optional `pc` field, so the
// client just sends a streak-boosted value and lets the cap catch
// any silliness.
// ============================================================

export const STREAK_WINDOW_MS = 6_000;

export type StreakTier = {
  /** Min clicks within the window. */
  threshold: number;
  /** PC multiplier this tier applies to subsequent clicks. */
  multiplier: number;
  label: string;
};

export const STREAK_TIERS: readonly StreakTier[] = [
  { threshold: 0,  multiplier: 1.0, label: "—"             },
  { threshold: 5,  multiplier: 1.2, label: "Warm"          },
  { threshold: 15, multiplier: 1.5, label: "Hot"           },
  { threshold: 30, multiplier: 2.0, label: "Money Frenzy!" },
];

/** Money Frenzy threshold also unlocks a 5s burst of denser spawns. */
export const FRENZY_THRESHOLD = 30;
export const FRENZY_DURATION_MS = 5_000;
/** Spawn interval multiplier while Money Frenzy is active. */
export const FRENZY_SPAWN_MULTIPLIER = 0.35;
/** Extra concurrent coins per Frenzy tick. */
export const FRENZY_BURST_SIZE = 4;

// ============================================================
// CLICK / OFFLINE LIMITS
// ============================================================

/** Max clicks/sec the server will credit (sliding-window guard). */
export const MAX_CLICKS_PER_SEC = 25;
/** Helper offline accrual is capped at this many hours of last-tick gap. */
export const OFFLINE_CAP_HOURS = 8;

// ============================================================
// EVENTS — Phase 2b
//
// Random events spice up the otherwise-steady spawn loop. Each
// /state poll the client rolls START_CHANCE_PER_POLL for an
// inactive event; if it lands, the event runs for DURATION_MS
// and applies its visual + spawn modifiers locally. The wallet
// endpoint persists Frugality changes from the moral-choice
// Lost Wallet event server-side.
// ============================================================

export type EventId = "coin_storm" | "rainy_day";

export type EventDef = {
  id: EventId;
  label: string;
  blurb: string;
  durationMs: number;
  /** Spawn rate multiplier while active (e.g. 0.5 = twice as fast). */
  spawnMultiplier: number;
  /** Extra simultaneous coins allowed during the event. */
  extraConcurrent: number;
  /** Additive shiny chance during the event (0-1 absolute). */
  bonusShinyChance: number;
};

export const EVENTS: Record<EventId, EventDef> = {
  coin_storm: {
    id: "coin_storm",
    label: "Coin Storm",
    blurb: "Coins are pouring down — click as many as you can!",
    durationMs: 20_000,
    spawnMultiplier: 0.4,
    extraConcurrent: 6,
    bonusShinyChance: 0,
  },
  rainy_day: {
    id: "rainy_day",
    label: "Rainy Day",
    blurb: "Wet sidewalk, slow spawns — but the puddles glint with shinies.",
    durationMs: 30_000,
    spawnMultiplier: 1.5,
    extraConcurrent: 0,
    bonusShinyChance: 0.05,
  },
};

/** Per-poll chance the client tries to roll a new event when none active. */
export const EVENT_START_CHANCE_PER_POLL = 0.025;

// ============================================================
// WISHING FOUNTAIN — Phase 2c
//
// Rare sprite. Click to open a modal where the player can toss
// PC into the fountain in exchange for a temporary client-side
// blessing. Server validates only the cent debit; the buff window
// lives on the client (server-trustless because it only modifies
// spawn behaviour, not click payouts).
// ============================================================

export type BlessingId = "lucky_streak" | "sharp_eyes" | "greedy_spawns" | "frugal_toss";

export type BlessingDef = {
  id: BlessingId;
  label: string;
  blurb: string;
  /** PC cost paid when the blessing is selected. */
  cost: number;
  durationMs: number;
  /** Optional Frugality grant. Used by `frugal_toss` to convert a
   *  small PC sacrifice into a permanent Frugality point. */
  frugality?: number;
};

export const BLESSINGS: Record<BlessingId, BlessingDef> = {
  lucky_streak:  { id: "lucky_streak",  label: "Lucky Streak",  blurb: "+10% shiny chance for 30s.",                    cost: 250,  durationMs: 30_000 },
  sharp_eyes:    { id: "sharp_eyes",    label: "Sharp Eyes",    blurb: "Spawns twice as fast for 30s.",                  cost: 400,  durationMs: 30_000 },
  greedy_spawns: { id: "greedy_spawns", label: "Greedy Spawns", blurb: "+50% chance to spawn the highest unlocked coin for 30s.", cost: 600, durationMs: 30_000 },
  // Quiet, virtuous option — drop a coin in the fountain and walk
  // away with one Frugality point. No buff timer, just the karma.
  frugal_toss:   { id: "frugal_toss",   label: "Toss a coin and walk away", blurb: "Drop 50 PC in the fountain and walk. +1 Frugality.", cost: 50, durationMs: 0, frugality: 1 },
};

/** Per-poll chance a Wishing Fountain spawns when none on screen. */
export const FOUNTAIN_CHANCE_PER_POLL = 0.008;
/** Lifetime of the fountain sprite before it despawns unclicked. */
export const FOUNTAIN_LIFETIME_MS = 25_000;

// ============================================================
// COUCH CUSHION DIVE — Phase 2c
//
// Rare sprite. Click to open a modal with 4 cushions; each
// cushion-click rolls one of the items below server-side
// (/cushion endpoint). All cents are credited to the per-run PC
// pool; lifetime_clicks ticks per cushion. Closes after all 4
// reveals or after a 15s timeout.
// ============================================================

export type CushionLootId =
  | "lint"
  | "penny_pile"
  | "nickel_pile"
  | "dime_pile"
  | "quarter_pile"
  | "half_dollar_pile"
  | "dollar_pile"
  | "jackpot";

export type CushionLoot = {
  id: CushionLootId;
  label: string;
  /** PC paid when this cushion is revealed. */
  pc: number;
  /** Relative weight in the loot roll. */
  weight: number;
  /** Frugality awarded when revealed. Lint gives +1 as a
   *  consolation prize for the bad RNG (matches the Frugality
   *  fantasy of "I didn't even need that"). */
  frugality?: number;
  /** UI tier — drives the reveal card's colour + decoration. */
  tier: "lint" | "low" | "mid" | "high" | "jackpot";
};

// Rebalanced from the old ~50-PC mean to ~1,250 PC mean per
// cushion (×4 cushions ≈ 5,000 PC per couch event). The couch
// sprite spawns rarely (~0.6% per poll), so the throughput stays
// reasonable but each event reads as a real find. Two new tiers
// (half-dollar + dollar piles) give the loot table more reveal
// variety and let the modal show a wider range of card colours.
export const CUSHION_LOOT: readonly CushionLoot[] = [
  { id: "lint",             label: "Lint",       pc: 0,      weight: 4,  frugality: 1, tier: "lint" },
  { id: "penny_pile",       label: "Pennies",    pc: 50,     weight: 22, tier: "low" },
  { id: "nickel_pile",      label: "Nickels",    pc: 200,    weight: 20, tier: "low" },
  { id: "dime_pile",        label: "Dimes",      pc: 600,    weight: 14, tier: "mid" },
  { id: "quarter_pile",     label: "Quarters",   pc: 1_500,  weight: 8,  tier: "mid" },
  { id: "half_dollar_pile", label: "Half-Dollars", pc: 4_000, weight: 5, tier: "high" },
  { id: "dollar_pile",      label: "Dollars",    pc: 10_000, weight: 2,  tier: "high" },
  { id: "jackpot",          label: "Jackpot!",   pc: 30_000, weight: 1,  tier: "jackpot" },
];

/** Per-poll chance a Couch sprite spawns when none on screen. */
export const COUCH_CHANCE_PER_POLL = 0.006;
/** Lifetime of the couch sprite before it despawns unclicked. */
export const COUCH_LIFETIME_MS = 30_000;
/** Cushions revealed per couch session. */
export const COUCH_CUSHIONS = 4;

// ============================================================
// FRUGALITY — Phase 2c consumer
//
// Each positive Frugality point grants a flat PC multiplier on
// every click. Negative Frugality has no penalty for v1; future
// phases can introduce cursed-coin chance / risky variants.
// ============================================================

/** PC multiplier per positive Frugality point (e.g. 0.005 → +0.5%/pt). */
export const FRUGALITY_PC_PER_POINT = 0.005;

// ============================================================
// RELICS
//
// Spent Frugality on a chest → server rolls a random relic by
// tier weights → relic level increments (or starts at 1). Relics
// survive Roll-Up; their effects stack across the run.
// ============================================================

export type RelicRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type RelicId =
  | "lucky_charm"
  | "helping_hand"
  | "midas_thumb"
  | "fast_fingers"
  | "thick_pockets"
  | "merchant_seal"
  | "rainmaker"
  | "ancient_idol"
  | "fortunes_eye"
  | "saints_mark"
  | "merging_hands";

export type RelicDef = {
  id: RelicId;
  label: string;
  description: string;
  rarity: RelicRarity;
  maxLevel: number;
};

// Relic effects rebalanced to 3× their original strength —
// Frugality is hard to earn (mostly Lost Wallet returns + a couple
// of milestone trophies) so each chest-roll outcome needs to feel
// like it earned the cost.
export const RELICS: readonly RelicDef[] = [
  { id: "lucky_charm",   label: "Lucky Charm",   description: "+3% shiny chance per level.",                                      rarity: "common",    maxLevel: 5 },
  { id: "helping_hand",  label: "Helping Hand",  description: "+30% helper PC/sec per level.",                                    rarity: "common",    maxLevel: 5 },
  { id: "midas_thumb",   label: "Midas Thumb",   description: "+30% PC on every click per level.",                                rarity: "uncommon",  maxLevel: 5 },
  { id: "fast_fingers",  label: "Fast Fingers",  description: "Coins spawn 15% faster per level.",                                rarity: "uncommon",  maxLevel: 5 },
  { id: "thick_pockets", label: "Thick Pockets", description: "+3,000 PC starting after every Prestige per level.",               rarity: "rare",      maxLevel: 5 },
  { id: "merchant_seal", label: "Merchant Seal", description: "+15% wallet ¢ on every Bank-It per level.",                        rarity: "rare",      maxLevel: 5 },
  // New — directly addresses the Frugality grind. Each Lost Wallet
  // 'Return It' grants +1 base Frugality; this stacks an additional
  // +1 per level on top, so a maxed Saint's Mark turns each return
  // into +6 Frugality.
  { id: "saints_mark",   label: "Saint's Mark",  description: "Returning a Lost Wallet awards +1 extra Frugality per level (on top of the base +1).", rarity: "rare",  maxLevel: 5 },
  { id: "rainmaker",     label: "Rainmaker",     description: "+3% per level chance for a Coin Storm to start each poll.",        rarity: "epic",      maxLevel: 5 },
  { id: "ancient_idol",  label: "Ancient Idol",  description: "+0.15% Ancient-coin spawn chance per level.",                      rarity: "epic",      maxLevel: 3 },
  { id: "fortunes_eye",  label: "Fortune's Eye", description: "Every coin is worth +15 PC permanently per level (stacks with everything).", rarity: "legendary", maxLevel: 3 },
  // Single-rank legendary — Pile It Up's slide + min-age delays
  // both halve, so chains form twice as fast.
  { id: "merging_hands", label: "Merging Hands", description: "Coins merge twice as fast — slide + ready-to-merge delay both halve.", rarity: "legendary", maxLevel: 1 },
];

export const RELICS_BY_ID: Record<RelicId, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r]),
) as Record<RelicId, RelicDef>;

// Chest tiers — each gives one relic, weighted by tier rarities.

export type ChestTier = "bronze" | "silver" | "gold";

export type ChestDef = {
  id: ChestTier;
  label: string;
  /** Frugality cost. */
  cost: number;
  /** Rarity → weight; non-zero entries form the roll table. */
  weights: Partial<Record<RelicRarity, number>>;
};

export const CHESTS: Record<ChestTier, ChestDef> = {
  bronze: {
    id: "bronze",
    label: "Bronze Chest",
    cost: 2,
    weights: { common: 70, uncommon: 25, rare: 5 },
  },
  silver: {
    id: "silver",
    label: "Silver Chest",
    cost: 6,
    weights: { common: 30, uncommon: 40, rare: 25, epic: 5 },
  },
  gold: {
    id: "gold",
    label: "Gold Chest",
    cost: 15,
    weights: { uncommon: 25, rare: 45, epic: 25, legendary: 5 },
  },
};

// Lost Wallet — single-shot spawn, separate from passive events.
/** Per-poll chance a Lost Wallet sprite spawns when none on screen. */
export const LOST_WALLET_CHANCE_PER_POLL = 0.012;
/** How long a Lost Wallet sits on screen before it despawns. */
export const LOST_WALLET_LIFETIME_MS = 18_000;
/** Floor PC awarded for "Keep the Change" (the morally-questionable choice). */
export const LOST_WALLET_KEEP_PC = 500;
/** Wealth-scaled bonus: % of current cents added on top of the floor. */
export const LOST_WALLET_KEEP_WEALTH_PCT = 0.15;
/** Hard ceiling on the keep-payout so a maxed merge stack doesn't dump infinity. */
export const LOST_WALLET_KEEP_MAX_PC = 50_000;
/** Frugality delta on each choice. */
export const LOST_WALLET_RETURN_FRUGALITY = 1;
export const LOST_WALLET_KEEP_FRUGALITY = -1;
/** Bounds applied server-side after each adjustment. */
// Frugality is uncapped — grinding wallet-returns / cushion lint /
// prestige tithes / saint's mark relics rewards a permanent PC
// multiplier (+0.5% per point), so the player who works for it
// deserves the payout. The constants stay as MAX_SAFE_INTEGER so
// the existing Math.min/Math.max clamping calls in the engine
// become effective no-ops without having to touch every callsite.
export const FRUGALITY_MIN = Number.MIN_SAFE_INTEGER;
export const FRUGALITY_MAX = Number.MAX_SAFE_INTEGER;

// ============================================================
// PRESTIGE — Phase 3a (reworked Phase 4)
//
// "Prestige" wipes session state (cents + helpers + run upgrades)
// and awards Bank Tokens proportional to the cents you cash in. The
// trigger is now `current cents` (not lifetime PC) — you have to
// grind a wallet's worth of coins into your pocket and decide
// whether to bank them for wallet ¢ OR sacrifice them for tokens.
// Tokens buy entries in PERM_UPGRADES below — those survive every
// reset.
// ============================================================

/** Minimum current cents required before the prestige button unlocks. */
export const PRESTIGE_THRESHOLD_CENTS = 100_000;

/**
 * Square-root payout tied to the cents spent at prestige time. The
 * earlier linear curve (floor(c / 25k) + 1) compounded too fast — a
 * 1M-cent prestige paid out 41 tokens, which made grinding to the
 * 100k threshold feel like a loser's move. Sqrt flattens the high
 * end while keeping the threshold floor at 5 tokens.
 *
 *   tokens = floor(sqrt(currentCents / 4_000))
 *
 *   100k →  5 tokens
 *   200k →  7 tokens
 *   300k →  8 tokens
 *   500k → 11 tokens
 *   1M   → 15 tokens
 *   10M  → 50 tokens
 */
export const PRESTIGE_TOKEN_DIVISOR = 4_000;

/** @deprecated kept for legacy props on the wire — see PRESTIGE_THRESHOLD_CENTS. */
export const PRESTIGE_THRESHOLD_PC = PRESTIGE_THRESHOLD_CENTS;
/** @deprecated kept for legacy clients — see PRESTIGE_TOKEN_DIVISOR. */
export const BANK_TOKEN_DIVISOR = PRESTIGE_TOKEN_DIVISOR;

export type PermUpgradeId =
  | "bigger_pockets"
  | "practice_eyes"
  | "vending_lifer"
  | "old_hand"
  | "lucky_streak"
  | "generous_helpers"
  | "higher_ceilings"
  | "prestige_tithe";

export type PermUpgradeDef = {
  id: PermUpgradeId;
  label: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
};

export const PERM_UPGRADES: readonly PermUpgradeDef[] = [
  // Quadratic scaling — seeds 1000 × level² PC into the next
  // prestige cycle. Card shows the actual current seed instead of
  // restating the formula in copy. Lvl 1=1k, lvl 5=25k, lvl 10=100k.
  { id: "bigger_pockets",   label: "Bigger Pockets",   description: "Seed each Prestige with starting PC.",   baseCost: 1, costMultiplier: 1.6, maxLevel: 10 },
  { id: "practice_eyes",    label: "Practice Eyes",    description: "Pennies are worth +5 PC permanently — applies before Penny Multiplier scaling.", baseCost: 3, costMultiplier: 1, maxLevel: 1 },
  { id: "vending_lifer",    label: "Vending Lifer",    description: "Start each Roll-Up with Check Vending Machines already at level 1 (nickels unlocked).", baseCost: 5, costMultiplier: 1, maxLevel: 1 },
  { id: "old_hand",         label: "Old Hand",         description: "Helpers keep generating PC for an extra hour while you're away per level.",        baseCost: 2, costMultiplier: 1.6, maxLevel: 8 },
  { id: "lucky_streak",     label: "Lucky Streak",     description: "+1% permanent shiny-coin chance per level. Stacks with Lucky Sidewalk Crack.",     baseCost: 5, costMultiplier: 1.7, maxLevel: 5 },
  { id: "generous_helpers", label: "Generous Helpers", description: "+25% PC/sec from all helpers per level.",                                          baseCost: 8, costMultiplier: 1.8, maxLevel: 4 },
  // Higher Ceilings — adds +10 to the max level of EVERY base
  // upgrade per level. At level 5 (max), Penny Multiplier goes
  // 20 → 70, Sharper Eyes 10 → 60, the spawn unlocks 5 → 55,
  // etc. Cost ramp is base 5 × 1.4^lvl rounded up: 5, 7, 10,
  // 14, 20★ — total 56★ for full extension.
  { id: "higher_ceilings",  label: "Higher Ceilings",  description: "+10 to the max level of every base upgrade per level. Stacks across all run upgrades — go deeper on what you like.", baseCost: 5, costMultiplier: 1.4, maxLevel: 5 },
  // Each rank multiplies Frugality gained on every Roll It Up by
  // a factor that scales 0.5× (L1) → 1.0× (L5). Gain on a prestige
  // is floor(newPrestigeCount × multiplier), capped at FRUGALITY_MAX.
  // Rewards committed prestige loops instead of paying out as a
  // one-shot purchase bonus.
  { id: "prestige_tithe",   label: "Prestige Tithe",   description: "Each prestige grants Frugality equal to your prestige count × this upgrade's multiplier (L1 0.5× → L5 1.0×).", baseCost: 4, costMultiplier: 1.7, maxLevel: 5 },
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
  | "first_million"
  | "treasure_hunter"
  | "relic_hoarder"
  | "page_turner"
  | "album_curator"
  | "frugal_saver"
  | "saint";

export type AchievementDef = {
  id: AchievementId;
  label: string;
  description: string;
  /** Bank Tokens awarded on first unlock. */
  reward: number;
  /** Frugality points awarded on first unlock. Used by the Frugality
   *  trophies (Frugal Saver, Saint) to reward virtuous play with a
   *  permanent run-side payout boost on top of the Bank Tokens. */
  frugalityReward?: number;
};

// Trophy stars now pay meaningfully — small wins drip 1-2★, big
// milestones pay 5-10★, and the truly flagship ones (every album
// page, ten Roll-Ups) drop a fat ten-star bag. Total set ≈ 67★
// across all 16 trophies if you complete everything.
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "a_penny_saved",         label: "A Penny Saved",         description: "Pick up your first coin.",                          reward: 1 },
  { id: "sidewalk_scholar",      label: "Sidewalk Scholar",      description: "Pick up 1,000 coins in your career.",               reward: 2 },
  { id: "coin_connoisseur",      label: "Coin Connoisseur",      description: "Pick up 10,000 coins in your career.",              reward: 3 },
  { id: "basically_mining",      label: "This Is Basically Mining", description: "Pick up 100,000 coins in your career.",          reward: 5 },
  { id: "goblin_mode",           label: "Goblin Mode",           description: "Hire the Laundromat Goblin.",                       reward: 2 },
  { id: "pile_it_up",            label: "Pile It Up",            description: "Buy the merging upgrade. Stack 'em.",               reward: 2 },
  { id: "bank_tellers_nightmare",label: "Bank Teller's Nightmare", description: "Roll It Up for the first time.",                 reward: 5 },
  { id: "bigger_boat",           label: "Bigger Boat",           description: "Roll It Up a second time. We're gonna need it.",    reward: 3 },
  { id: "frequent_flyer",        label: "Frequent Flyer",        description: "Roll It Up ten times.",                             reward: 10 },
  { id: "first_million",         label: "First Million",         description: "Bank 1,000,000 ¢ to your wallet across all sessions.", reward: 5 },

  // New systems
  { id: "treasure_hunter",       label: "Treasure Hunter",       description: "Open your first relic chest.",                      reward: 2 },
  { id: "relic_hoarder",         label: "Relic Hoarder",         description: "Own at least one of every relic.",                  reward: 8 },
  { id: "page_turner",           label: "Page Turner",           description: "Complete any one album page.",                       reward: 2 },
  { id: "album_curator",         label: "Album Curator",         description: "Complete every album page.",                         reward: 10 },
  // Frugality trophies — reward bookends on the Frugality grind.
  // Bank Token payouts unchanged; new frugalityReward stacks +5 / +10
  // permanent Frugality on top so reaching the milestone is its own
  // boost (Frugal Saver +5 = +2.5% PC, Saint +10 = +5%).
  { id: "frugal_saver",          label: "Frugal Saver",          description: "Hit +25 Frugality.",                                 reward: 2, frugalityReward: 5 },
  { id: "saint",                 label: "Saint",                 description: "Reach +50 Frugality.",                               reward: 5, frugalityReward: 10 },
];

export const ACHIEVEMENTS_BY_ID: Record<AchievementId, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<AchievementId, AchievementDef>;
