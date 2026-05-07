// Penny Pinchers — pure stateless game logic. Server validates with
// these helpers; client uses them for optimistic projections.

import {
  ACHIEVEMENTS,
  BANK_PC_PER_WALLET_CENT,
  BANK_TOKEN_DIVISOR,
  CHESTS,
  COINS,
  COIN_ORDER,
  FRUGALITY_PC_PER_POINT,
  HELPERS_BY_ID,
  MERGE_PROXIMITY_PX,
  OFFLINE_CAP_HOURS,
  PERM_UPGRADES_BY_ID,
  PRESTIGE_THRESHOLD_PC,
  RELICS,
  TRAITS,
  UPGRADES_BY_ID,
  type AchievementId,
  type ChestTier,
  type CoinId,
  type CoinTrait,
  type HelperId,
  type PermUpgradeId,
  type RelicDef,
  type RelicId,
  type UpgradeId,
} from "./catalog";

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;
export type HelperCounts = Partial<Record<HelperId, number>>;
export type PermLevels = Partial<Record<PermUpgradeId, number>>;

// ============================================================
// COIN VALUE
// ============================================================

/** PC paid for clicking one coin of `coinType`, given current upgrades + perm bonuses + relic effects. */
export function coinPCValue(
  coinType: CoinId,
  levels: UpgradeLevels,
  perm: PermLevels = {},
  relicE: RelicEffects = ZERO_EFFECTS,
): number {
  const base = COINS[coinType].basePC;
  // Penny Multiplier — adds +1 PC per level to *every* coin so it
  // stays useful end-to-end. Practice Eyes (perm) is penny-only
  // because that's the only denom 5 PC actually moves the needle on.
  const pennyBoost = levels.penny_multiplier ?? 0;
  // Fortune's Eye (relic) — flat bonus stacked across every coin.
  const relicBoost = relicE.coinBaseBonus;
  if (coinType === "penny") {
    const permBonus = (perm.practice_eyes ?? 0) * 5;
    return base + permBonus + pennyBoost + relicBoost;
  }
  return base + pennyBoost + relicBoost;
}

/**
 * Server-clamped trait multiplier. The client tells us "this was
 * shiny", we trust it but cap at the trait's maxMultiplier so a
 * tampered client can never dump more than the configured ceiling.
 * Bent is special-cased to 0.5× — it pays *less* by design, the
 * tradeoff for the lucky-window buff it gives the client.
 */
export function traitMultiplier(trait: CoinTrait | null | undefined): number {
  if (!trait) return 1;
  if (trait === "bent") return 0.5;
  const def = TRAITS[trait];
  if (!def) return 1;
  return def.maxMultiplier;
}

/**
 * PC multiplier from positive Frugality. Negative Frugality is a
 * no-op for v1 (no penalty); v2 will add cursed-coin chance.
 */
export function frugalityPCMultiplier(frugality: number): number {
  if (frugality <= 0) return 1;
  return 1 + frugality * FRUGALITY_PC_PER_POINT;
}

/**
 * Permanent PC multiplier from completed Roll-Ups. The first
 * prestige yields +300% (×4 PC on every coin pickup); each
 * subsequent prestige adds another +100%. Stacks multiplicatively
 * with trait, frugality, album, and relic multipliers.
 *
 *   prestiges  multiplier  bonus
 *   0          1×          +0%
 *   1          4×          +300%
 *   2          5×          +400%
 *   3          6×          +500%
 *   ...
 */
export function prestigePCMultiplier(prestigeCount: number): number {
  if (prestigeCount <= 0) return 1;
  return 3 + prestigeCount;
}

// ============================================================
// COIN ALBUM — Phase 2d
// ============================================================

export type AlbumPage = "shiny" | "sticky" | "foreign" | "bent" | "cursed" | "ancient";
export type AlbumState = Partial<Record<AlbumPage, Partial<Record<CoinId, number>>>>;

/** Coin denominations that participate in each page. */
export const ALBUM_PAGE_COINS: Record<AlbumPage, readonly CoinId[]> = {
  shiny:   ["penny", "nickel", "dime", "quarter", "half", "dollar"],
  sticky:  ["penny", "nickel"],
  foreign: ["penny", "nickel", "dime", "quarter", "half", "dollar"],
  bent:    ["penny", "nickel", "dime", "quarter", "half", "dollar"],
  cursed:  ["penny", "nickel", "dime", "quarter", "half", "dollar"],
  ancient: ["penny", "nickel", "dime", "quarter", "half", "dollar"],
};

/** Per-slot bonus added to the relevant trait chance (or PC bonus for foreign). */
const ALBUM_SLOT_BONUS: Record<AlbumPage, number> = {
  shiny:   0.005,
  sticky:  0.01,
  foreign: 0.005,   // PC bonus, not trait chance
  bent:    0.005,   // +0.5% bent chance per slot
  cursed:  0.003,   // +0.3% cursed chance per slot
  ancient: 0.0005,  // +0.05% ancient chance per slot
};

/** Bonus added when a page is fully complete (every coin collected at least once). */
const ALBUM_PAGE_COMPLETE_BONUS: Record<AlbumPage, number> = {
  shiny:   0.05,
  sticky:  0.03,
  foreign: 0.05,
  bent:    0.05,
  cursed:  0.03,
  ancient: 0.005,
};

/** Number of distinct coin slots filled on a page (0..page length). */
export function albumSlotsFilled(album: AlbumState, page: AlbumPage): number {
  const rows = album[page] ?? {};
  let count = 0;
  for (const coin of ALBUM_PAGE_COINS[page]) {
    if ((rows[coin] ?? 0) > 0) count++;
  }
  return count;
}

/** Whether every slot on a page has been filled at least once. */
export function albumPageComplete(album: AlbumState, page: AlbumPage): boolean {
  return albumSlotsFilled(album, page) >= ALBUM_PAGE_COINS[page].length;
}

/** Trait-spawn-chance bonus from the album for a given page. */
export function albumTraitBonus(album: AlbumState, page: AlbumPage): number {
  const slots = albumSlotsFilled(album, page);
  const complete = albumPageComplete(album, page);
  return slots * ALBUM_SLOT_BONUS[page] + (complete ? ALBUM_PAGE_COMPLETE_BONUS[page] : 0);
}

/**
 * Multiplier on every PC payout from completing the Foreign album.
 * This lives here so the click endpoint and the cushion endpoint can
 * both apply it without duplicating the slot/complete arithmetic.
 */
export function albumPCBonus(album: AlbumState): number {
  return 1 + albumTraitBonus(album, "foreign");
}

// ============================================================
// SPAWN POOL
// ============================================================

/** Returns the active coin spawn pool weighted by upgrades. */
export function spawnPool(levels: UpgradeLevels): { coin: CoinId; weight: number }[] {
  const pool: { coin: CoinId; weight: number }[] = [{ coin: "penny", weight: 100 }];
  // Each spawn-unlock upgrade contributes weight at level >= 1; later
  // levels (up to maxLevel) bump the weight further.
  const unlockMap: Array<[UpgradeId, CoinId, number, number]> = [
    // [upgrade,           coin,      base weight, per-level boost]
    ["vending_machines", "nickel",  20, 8],
    ["parking_lot",      "dime",    10, 5],
    ["laundry_day",      "quarter",  6, 3],
    ["boardwalk",        "half",     3, 2],
    ["grandpa_jar",      "dollar",   2, 1],
  ];
  for (const [upgradeId, coin, base, boost] of unlockMap) {
    const lvl = levels[upgradeId] ?? 0;
    if (lvl <= 0) continue;
    pool.push({ coin, weight: base + boost * (lvl - 1) });
  }
  return pool;
}

/** Pick a random coin from the spawn pool. */
export function rollSpawn(levels: UpgradeLevels, rand: () => number = Math.random): CoinId {
  const pool = spawnPool(levels);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e.coin;
  }
  return pool[pool.length - 1].coin;
}

/** Spawn rate in ms — base 1500ms, faster with sharper_eyes. */
export function spawnIntervalMs(levels: UpgradeLevels): number {
  const lvl = levels.sharper_eyes ?? 0;
  // 5% faster per level, capped at maxLevel=10 → 50% faster.
  return Math.round(1500 * Math.pow(0.95, lvl));
}

// ============================================================
// HELPERS
// ============================================================

/** Total PC produced per second across all owned helpers, with the Generous Helpers perm bonus + Helping Hand relic applied. */
export function helperRatePcPerSec(
  helpers: HelperCounts,
  perm: PermLevels = {},
  relicE: RelicEffects = ZERO_EFFECTS,
): number {
  let rate = 0;
  for (const [id, count] of Object.entries(helpers) as [HelperId, number][]) {
    const def = HELPERS_BY_ID[id];
    if (!def) continue;
    rate += def.pcPerSec * count;
  }
  const permBonus = 1 + 0.25 * (perm.generous_helpers ?? 0);
  return rate * permBonus * relicE.helperRateMul;
}

/** Effective offline accrual cap given the Old Hand permanent upgrade. */
export function offlineCapHours(perm: PermLevels = {}): number {
  return OFFLINE_CAP_HOURS + (perm.old_hand ?? 0);
}

/**
 * Compute PC accrued by helpers between `lastTickAt` and `now`,
 * capped at the offline window (extended by Old Hand) so a player
 * who comes back after a week doesn't get a free trillion.
 */
export function offlinePCAccrued(
  rate: number,
  lastTickAt: Date | null,
  perm: PermLevels = {},
  now: Date = new Date(),
): number {
  if (!lastTickAt || rate <= 0) return 0;
  const elapsedMs = now.getTime() - lastTickAt.getTime();
  if (elapsedMs <= 0) return 0;
  const cappedMs = Math.min(elapsedMs, offlineCapHours(perm) * 60 * 60 * 1000);
  return Math.floor((cappedMs / 1000) * rate);
}

// ============================================================
// COSTS
// ============================================================

/** PC cost to take an upgrade from `currentLevel` to `currentLevel + 1`. */
export function nextUpgradeCost(upgradeId: UpgradeId, currentLevel: number): number | null {
  const def = UPGRADES_BY_ID[upgradeId];
  if (!def) return null;
  if (currentLevel >= def.maxLevel) return null;
  return Math.ceil(def.baseCost * Math.pow(def.costMultiplier, currentLevel));
}

/** PC cost to hire one more of `helperId`, given `currentCount` already owned. */
export function nextHelperCost(helperId: HelperId, currentCount: number): number | null {
  const def = HELPERS_BY_ID[helperId];
  if (!def) return null;
  if (currentCount >= def.maxOwn) return null;
  return Math.ceil(def.baseCost * Math.pow(def.costMultiplier, currentCount));
}

// ============================================================
// BANK IT
// ============================================================

/**
 * Compute the wallet ¢ payout for banking `cents` (PC). No caps —
 * the player gets the full PC → wallet conversion every time.
 */
export function bankPayoutCents(cents: number): number {
  if (cents <= 0) return 0;
  return Math.floor(cents / BANK_PC_PER_WALLET_CENT);
}

// ============================================================
// MISC HELPERS used by the client
// ============================================================

// ============================================================
// TRAITS — roll on spawn
// ============================================================

/**
 * Roll a trait for a freshly-spawned coin. Returns null when the
 * coin is plain. Sticky is a separate roll from shiny so a coin can
 * only be one or the other (shiny wins ties).
 */
export function rollTrait(
  coinType: CoinId,
  levels: UpgradeLevels,
  perm: PermLevels = {},
  album: AlbumState = {},
  relicE: RelicEffects = ZERO_EFFECTS,
  rand: () => number = Math.random,
): CoinTrait | null {
  const luck = levels.lucky_crack ?? 0;
  const permLuck = perm.lucky_streak ?? 0;

  // Roll order matters when multiple traits could land — earlier
  // roll wins. Rarest-first so an Ancient never gets clobbered
  // by a cheap Bent.
  const ancientChance =
    TRAITS.ancient.baseChance + TRAITS.ancient.perLuckLevel * luck +
    albumTraitBonus(album, "ancient") + relicE.ancientChanceBonus;
  if (rand() < ancientChance) return "ancient";

  const cursedChance =
    TRAITS.cursed.baseChance + TRAITS.cursed.perLuckLevel * luck +
    albumTraitBonus(album, "cursed");
  if (rand() < cursedChance) return "cursed";

  const shinyChance =
    TRAITS.shiny.baseChance + TRAITS.shiny.perLuckLevel * luck +
    0.01 * permLuck + albumTraitBonus(album, "shiny") + relicE.shinyChanceBonus;
  if (rand() < shinyChance) return "shiny";

  const foreignChance =
    TRAITS.foreign.baseChance + TRAITS.foreign.perLuckLevel * luck;
  if (rand() < foreignChance) return "foreign";

  const bentChance =
    TRAITS.bent.baseChance + TRAITS.bent.perLuckLevel * luck +
    albumTraitBonus(album, "bent");
  if (rand() < bentChance) return "bent";

  // Sticky only on penny / nickel — feels weird on big coins.
  if (coinType === "penny" || coinType === "nickel") {
    const stickyChance = TRAITS.sticky.baseChance + TRAITS.sticky.perLuckLevel * luck +
      albumTraitBonus(album, "sticky");
    if (rand() < stickyChance) return "sticky";
  }
  return null;
}

// ============================================================
// MERGING — proximity sum-fusion
// ============================================================

export type MergePoint = {
  id: number;
  /** Combined PC value of this coin (post any prior merges). */
  pc: number;
  x: number;
  y: number;
  spawnedAt: number;
};

/**
 * Find one merge pair among the given points, if any. Returns the
 * two ids to fuse + the centroid + the merged PC value. Linear
 * O(n²) scan; the play area never holds more than ~20 coins.
 */
export function findMergePair(
  points: MergePoint[],
  proximityPx: number = MERGE_PROXIMITY_PX,
): { ids: [number, number]; centroid: { x: number; y: number }; pc: number } | null {
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy <= proximityPx * proximityPx) {
        return {
          ids: [a.id, b.id],
          centroid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          pc: a.pc + b.pc,
        };
      }
    }
  }
  return null;
}

// ============================================================
// PINCH STREAK — find the active tier given recent click times
// ============================================================

import { STREAK_TIERS, STREAK_WINDOW_MS, type StreakTier } from "./catalog";

export function streakTierFor(clickTimes: number[], now: number = Date.now()): StreakTier {
  const cutoff = now - STREAK_WINDOW_MS;
  const fresh = clickTimes.filter((t) => t >= cutoff);
  let active = STREAK_TIERS[0];
  for (const tier of STREAK_TIERS) {
    if (fresh.length >= tier.threshold) active = tier;
  }
  return active;
}

/** Drop click timestamps that fell out of the streak window. */
export function pruneStreakWindow(clickTimes: number[], now: number = Date.now()): number[] {
  const cutoff = now - STREAK_WINDOW_MS;
  return clickTimes.filter((t) => t >= cutoff);
}

// ============================================================
// RELICS — chest roll + effect aggregation
// ============================================================

export type RelicLevels = Partial<Record<RelicId, number>>;

/**
 * Pick a random relic from a chest's weight table. Returns null
 * only if the chest has no eligible relics (shouldn't happen in
 * the catalogued config). Caller supplies the RNG so the server
 * can use crypto-grade randomness.
 */
export function rollRelicFromChest(
  tier: ChestTier,
  rand01: () => number,
): RelicDef | null {
  const weights = CHESTS[tier].weights;
  const totalWeight = Object.values(weights).reduce((s, v) => s + (v ?? 0), 0);
  if (totalWeight <= 0) return null;
  let r = rand01() * totalWeight;
  let pickedRarity: keyof typeof weights | null = null;
  for (const [rarity, w] of Object.entries(weights) as Array<[keyof typeof weights, number]>) {
    r -= w;
    if (r <= 0) { pickedRarity = rarity; break; }
  }
  if (!pickedRarity) pickedRarity = Object.keys(weights)[0] as keyof typeof weights;
  const pool = RELICS.filter((d) => d.rarity === pickedRarity);
  if (pool.length === 0) return null;
  return pool[Math.floor(rand01() * pool.length)];
}

/**
 * Aggregated effect bundle from owned relics. Effects are
 * additive within a relic (level 3 of Lucky Charm = +3% shiny)
 * and cumulative across relics. Consumers apply each field where
 * relevant — click endpoint reads clickPCMul, spawn loop reads
 * spawnSpeedMul, etc.
 */
export type RelicEffects = {
  /** Additive bonus to spawn shiny chance. */
  shinyChanceBonus: number;
  /** Multiplier on helper PC/sec (1 + Σ 0.10 per level of helping_hand). */
  helperRateMul: number;
  /** Multiplier on every click PC. */
  clickPCMul: number;
  /** Multiplier on spawn interval (<1 = faster). */
  spawnSpeedMul: number;
  /** Bonus PC seeded at the start of each Roll-Up. */
  prestigeStartBonusPC: number;
  /** Multiplier on Bank-It wallet ¢ payout. */
  bankPayoutMul: number;
  /** Per-poll bonus chance for a Coin Storm event. */
  stormChanceBonus: number;
  /** Additive bonus to ancient-spawn chance. */
  ancientChanceBonus: number;
  /** Flat PC added to every coin's base value (stacks with Penny Multiplier). */
  coinBaseBonus: number;
};

const ZERO_EFFECTS: RelicEffects = {
  shinyChanceBonus: 0,
  helperRateMul: 1,
  clickPCMul: 1,
  spawnSpeedMul: 1,
  prestigeStartBonusPC: 0,
  bankPayoutMul: 1,
  stormChanceBonus: 0,
  ancientChanceBonus: 0,
  coinBaseBonus: 0,
};

export function relicEffects(relics: RelicLevels): RelicEffects {
  const e: RelicEffects = { ...ZERO_EFFECTS };
  const lvl = (id: RelicId) => relics[id] ?? 0;
  e.shinyChanceBonus    += 0.01  * lvl("lucky_charm");
  e.helperRateMul       += 0.10  * lvl("helping_hand");
  e.clickPCMul          += 0.10  * lvl("midas_thumb");
  e.spawnSpeedMul       *= Math.pow(0.95, lvl("fast_fingers"));
  e.prestigeStartBonusPC += 1000 * lvl("thick_pockets");
  e.bankPayoutMul       += 0.05  * lvl("merchant_seal");
  e.stormChanceBonus    += 0.01  * lvl("rainmaker");
  e.ancientChanceBonus  += 0.0005 * lvl("ancient_idol");
  e.coinBaseBonus       += 5     * lvl("fortunes_eye");
  return e;
}

// ============================================================
// PRESTIGE
// ============================================================

/** Bank Tokens awarded for a Roll-It-Up at this lifetime PC. */
export function bankTokensFromPrestige(lifetimePCEarned: number): number {
  if (lifetimePCEarned < PRESTIGE_THRESHOLD_PC) return 0;
  return Math.floor(Math.sqrt(lifetimePCEarned / BANK_TOKEN_DIVISOR));
}

/** Whether the player has hit the threshold to prestige. */
export function canPrestige(lifetimePCEarned: number): boolean {
  return lifetimePCEarned >= PRESTIGE_THRESHOLD_PC;
}

/** Bank Token cost to take a perm upgrade from `currentLevel` to `currentLevel + 1`. */
export function nextPermUpgradeCost(upgradeId: PermUpgradeId, currentLevel: number): number | null {
  const def = PERM_UPGRADES_BY_ID[upgradeId];
  if (!def) return null;
  if (currentLevel >= def.maxLevel) return null;
  return Math.ceil(def.baseCost * Math.pow(def.costMultiplier, currentLevel));
}

/**
 * Starting cents for a fresh Roll-Up cycle, given perm upgrades.
 * Bigger Pockets puts +1k PC in the player's pocket per level.
 */
export function prestigeStartingCents(perm: PermLevels): number {
  return (perm.bigger_pockets ?? 0) * 1_000;
}

// ============================================================
// ACHIEVEMENTS — condition predicates
//
// Pure check given a snapshot of state + helpers + upgrades. The
// state route runs `detectNewUnlocks` once per fetch against the
// rows already persisted to compute what to insert + credit.
// ============================================================

export type AchievementSnapshot = {
  lifetimeClicks: number;
  prestigeCount: number;
  lifetimeBankedCents: number;
  frugality: number;
  helpers: HelperCounts;
  upgrades: UpgradeLevels;
  album: AlbumState;
  relics: RelicLevels;
};

const CONDITIONS: Record<AchievementId, (s: AchievementSnapshot) => boolean> = {
  a_penny_saved:          (s) => s.lifetimeClicks >= 1,
  sidewalk_scholar:       (s) => s.lifetimeClicks >= 1_000,
  coin_connoisseur:       (s) => s.lifetimeClicks >= 10_000,
  basically_mining:       (s) => s.lifetimeClicks >= 100_000,
  goblin_mode:            (s) => (s.helpers.laundry_goblin ?? 0) >= 1,
  pile_it_up:             (s) => (s.upgrades.pile_it_up ?? 0) >= 1,
  bank_tellers_nightmare: (s) => s.prestigeCount >= 1,
  bigger_boat:            (s) => s.prestigeCount >= 2,
  frequent_flyer:         (s) => s.prestigeCount >= 10,
  first_million:          (s) => s.lifetimeBankedCents >= 1_000_000,
  treasure_hunter:        (s) => Object.keys(s.relics).length >= 1,
  relic_hoarder:          (s) => Object.keys(s.relics).length >= RELICS.length,
  page_turner:            (s) => (Object.keys(ALBUM_PAGE_COINS) as AlbumPage[]).some((p) => albumPageComplete(s.album, p)),
  album_curator:          (s) => (Object.keys(ALBUM_PAGE_COINS) as AlbumPage[]).every((p) => albumPageComplete(s.album, p)),
  frugal_saver:           (s) => s.frugality >= 25,
  saint:                  (s) => s.frugality >= 50,
};

/**
 * Returns the achievement ids whose condition is met but which are
 * not already in `alreadyUnlocked`. Caller persists rows + credits
 * the bank-token reward in one batch.
 */
export function detectNewUnlocks(
  snapshot: AchievementSnapshot,
  alreadyUnlocked: Set<string>,
): AchievementId[] {
  const out: AchievementId[] = [];
  for (const def of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(def.id)) continue;
    if (CONDITIONS[def.id](snapshot)) out.push(def.id);
  }
  return out;
}

/** Coins the player has unlocked (i.e. has at least 1 level in the unlock upgrade). */
export function unlockedCoins(levels: UpgradeLevels): CoinId[] {
  const list: CoinId[] = ["penny"];
  for (const id of COIN_ORDER) {
    if (id === "penny") continue;
    const unlockerEntry = Object.entries(UPGRADES_BY_ID).find(
      ([, def]) => def.unlocksCoin === id,
    );
    if (!unlockerEntry) continue;
    const [unlockerId] = unlockerEntry as [UpgradeId, unknown];
    if ((levels[unlockerId] ?? 0) >= 1) list.push(id);
  }
  return list;
}
