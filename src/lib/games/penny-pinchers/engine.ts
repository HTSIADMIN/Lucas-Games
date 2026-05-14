// Penny Pinchers — pure stateless game logic. Server validates with
// these helpers; client uses them for optimistic projections.

import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  BANK_PC_PER_WALLET_CENT,
  BLESSINGS,
  CHESTS,
  COINS,
  COIN_ORDER,
  CUSHION_LOOT,
  FRUGALITY_MAX,
  FRUGALITY_MIN,
  FRUGALITY_PC_PER_POINT,
  HELPERS,
  HELPERS_BY_ID,
  MERGE_PROXIMITY_PX,
  OFFLINE_CAP_HOURS,
  PERM_UPGRADES_BY_ID,
  PRESTIGE_THRESHOLD_CENTS,
  PRESTIGE_TOKEN_DIVISOR,
  RELICS,
  TRAITS,
  UPGRADES,
  UPGRADES_BY_ID,
  type AchievementId,
  type BlessingId,
  type ChestTier,
  type CoinId,
  type CoinTrait,
  type CushionLootId,
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
  // "Coin Value" upgrade — scales every coin's base by +10% per
  // level. Replaces the old flat-+1-PC Penny Multiplier so the
  // pecking order between denominations stays intact at high
  // levels (1/5/10/25/50/100 base × the same multiplier).
  // upgrade_id is unchanged so existing rows persist.
  const coinValueLvl = levels.penny_multiplier ?? 0;
  const valueMul = 1 + 0.1 * coinValueLvl;
  // Coin Polish — flat +1 PC per level, capped at 5. Stacks on top
  // of the multiplier so it punches above its weight on pennies
  // without inflating dollar payouts past their pecking order.
  const polishLvl = levels.coin_polish ?? 0;
  const polishBonus = polishLvl;
  // Practice Eyes (perm) is penny-only — kept as a flat +5 because
  // that's the only denom 5 PC actually moves the needle on.
  const permBonus = coinType === "penny" ? (perm.practice_eyes ?? 0) * 5 : 0;
  // Fortune's Eye (relic) — flat bonus stacked across every coin.
  const relicBoost = relicE.coinBaseBonus;
  return Math.round(base * valueMul) + polishBonus + permBonus + relicBoost;
}

/**
 * Server-clamped trait multiplier. The client tells us which traits
 * landed on the coin; we cap each at the trait's `maxMultiplier`
 * and multiply them together so a multi-trait coin (e.g. shiny
 * AND cursed) compounds — shiny ×5 × cursed ×3 = ×15 click payout.
 *
 * Bent is special-cased to 0.5× — it pays *less* by design, the
 * tradeoff for the lucky-window buff it gives the client.
 *
 * Accepts a single trait or an array (back-compat with the legacy
 * single-trait wire format). null / empty → ×1 (plain coin).
 */
export function traitMultiplier(
  traits: CoinTrait | CoinTrait[] | null | undefined,
): number {
  if (!traits) return 1;
  const list = Array.isArray(traits) ? traits : [traits];
  if (list.length === 0) return 1;
  let mult = 1;
  for (const t of list) {
    if (t === "bent") {
      mult *= 0.5;
      continue;
    }
    const def = TRAITS[t];
    if (def) mult *= def.maxMultiplier;
  }
  return mult;
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

export type AlbumPage =
  | "shiny" | "sticky" | "foreign" | "bent" | "cursed" | "ancient"
  | "lightning" | "frosted" | "lucky";
export type AlbumState = Partial<Record<AlbumPage, Partial<Record<CoinId, number>>>>;

const ALL_DENOMS: readonly CoinId[] = ["penny", "nickel", "dime", "quarter", "half", "dollar"];

/** Coin denominations that participate in each page. */
export const ALBUM_PAGE_COINS: Record<AlbumPage, readonly CoinId[]> = {
  shiny:     ALL_DENOMS,
  sticky:    ["penny", "nickel"],
  foreign:   ALL_DENOMS,
  bent:      ALL_DENOMS,
  cursed:    ALL_DENOMS,
  ancient:   ALL_DENOMS,
  lightning: ALL_DENOMS,
  frosted:   ALL_DENOMS,
  lucky:     ALL_DENOMS,
};

/** Per-slot bonus added to the relevant trait chance (or PC bonus for foreign). */
const ALBUM_SLOT_BONUS: Record<AlbumPage, number> = {
  shiny:     0.005,
  sticky:    0.01,
  foreign:   0.005,   // PC bonus, not trait chance
  bent:      0.005,   // +0.5% bent chance per slot
  cursed:    0.003,   // +0.3% cursed chance per slot
  ancient:   0.0005,  // +0.05% ancient chance per slot
  lightning: 0.003,
  frosted:   0.005,
  lucky:     0.005,
};

/** Bonus added when a page is fully complete (every coin collected at least once). */
const ALBUM_PAGE_COMPLETE_BONUS: Record<AlbumPage, number> = {
  shiny:     0.05,
  sticky:    0.03,
  foreign:   0.05,
  bent:      0.05,
  cursed:    0.03,
  ancient:   0.005,
  lightning: 0.03,
  frosted:   0.05,
  lucky:     0.05,
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
  //
  // Old weights (boardwalk 3, grandpa 2 base) gave half-dollars a
  // ~2% spawn rate even after the player paid 250k PC for the
  // upgrade — players reasonably reported it as "didn't work".
  // Rebalanced so each tier reads as visibly more frequent than
  // the next-cheaper tier, and a fully-maxed spawn shop pushes
  // pennies down from 71% → 36% of the pool.
  const unlockMap: Array<[UpgradeId, CoinId, number, number]> = [
    // [upgrade,           coin,      base weight, per-level boost]
    ["vending_machines", "nickel",  25, 10],
    ["parking_lot",      "dime",    15, 7],
    ["laundry_day",      "quarter", 10, 5],
    ["boardwalk",        "half",     8, 4],
    ["grandpa_jar",      "dollar",   6, 3],
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

/**
 * The Higher Ceilings perm upgrade adds +10 to the max level of every
 * base upgrade per level. Single source of truth for "what's the
 * effective ceiling on this run upgrade for this player."
 *
 * Upgrades flagged `ceilingExempt` (Pile It Up) are binary unlocks —
 * Higher Ceilings doesn't apply, so the player can't waste cents
 * "buying" the merging upgrade ten extra times.
 */
export function effectiveUpgradeMaxLevel(
  upgrade: { maxLevel: number; ceilingExempt?: boolean },
  perm: PermLevels = {},
): number {
  if (upgrade.ceilingExempt) return upgrade.maxLevel;
  return upgrade.maxLevel + (perm.higher_ceilings ?? 0) * 10;
}

/** PC cost to take an upgrade from `currentLevel` to `currentLevel + 1`. */
export function nextUpgradeCost(
  upgradeId: UpgradeId,
  currentLevel: number,
  perm: PermLevels = {},
): number | null {
  const def = UPGRADES_BY_ID[upgradeId];
  if (!def) return null;
  if (currentLevel >= effectiveUpgradeMaxLevel(def, perm)) return null;
  // costSchedule overrides the geometric formula. Index N is the
  // cost to take the upgrade to level (N+1), so currentLevel itself
  // is the index. Falls back to formula past the schedule's end.
  if (def.costSchedule && currentLevel < def.costSchedule.length) {
    return def.costSchedule[currentLevel];
  }
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
 * Roll traits for a freshly-spawned coin. Each trait rolls
 * independently — a coin can land plain, single-trait, or
 * occasionally multi-trait when several rolls hit at once. Multi-
 * trait coins are rare (each trait is ~0.5–1.5%) so two-trait
 * combos sit around ~0.005–0.02% per spawn, which lets them feel
 * like a "wow" moment while still happening enough to matter.
 *
 * Trait effects compound on click via `traitMultiplier(traits[])`.
 *
 * Sticky is gated to penny/nickel only (looks weird on premiums).
 */
export function rollTraits(
  coinType: CoinId,
  levels: UpgradeLevels,
  perm: PermLevels = {},
  album: AlbumState = {},
  relicE: RelicEffects = ZERO_EFFECTS,
  rand: () => number = Math.random,
): CoinTrait[] {
  const luck = levels.lucky_crack ?? 0;
  const permLuck = perm.lucky_streak ?? 0;
  const out: CoinTrait[] = [];

  if (rand() <
    TRAITS.ancient.baseChance + TRAITS.ancient.perLuckLevel * luck +
    albumTraitBonus(album, "ancient") + relicE.ancientChanceBonus) out.push("ancient");

  if (rand() <
    TRAITS.cursed.baseChance + TRAITS.cursed.perLuckLevel * luck +
    albumTraitBonus(album, "cursed")) out.push("cursed");

  if (rand() <
    TRAITS.shiny.baseChance + TRAITS.shiny.perLuckLevel * luck +
    0.01 * permLuck + albumTraitBonus(album, "shiny") + relicE.shinyChanceBonus) out.push("shiny");

  if (rand() <
    TRAITS.foreign.baseChance + TRAITS.foreign.perLuckLevel * luck) out.push("foreign");

  if (rand() <
    TRAITS.bent.baseChance + TRAITS.bent.perLuckLevel * luck +
    albumTraitBonus(album, "bent")) out.push("bent");

  if (rand() <
    TRAITS.lightning.baseChance + TRAITS.lightning.perLuckLevel * luck +
    albumTraitBonus(album, "lightning")) out.push("lightning");

  if (rand() <
    TRAITS.frosted.baseChance + TRAITS.frosted.perLuckLevel * luck +
    albumTraitBonus(album, "frosted")) out.push("frosted");

  if (rand() <
    TRAITS.lucky.baseChance + TRAITS.lucky.perLuckLevel * luck +
    albumTraitBonus(album, "lucky")) out.push("lucky");

  if (coinType === "penny" || coinType === "nickel") {
    if (rand() <
      TRAITS.sticky.baseChance + TRAITS.sticky.perLuckLevel * luck +
      albumTraitBonus(album, "sticky")) out.push("sticky");
  }

  return out;
}

/** @deprecated kept so legacy callers compile — use rollTraits. */
export function rollTrait(
  coinType: CoinId,
  levels: UpgradeLevels,
  perm: PermLevels = {},
  album: AlbumState = {},
  relicE: RelicEffects = ZERO_EFFECTS,
  rand: () => number = Math.random,
): CoinTrait | null {
  const list = rollTraits(coinType, levels, perm, album, relicE, rand);
  return list[0] ?? null;
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
 * additive within a relic (level 3 of Lucky Charm = +9% shiny at 3×
 * tuning) and cumulative across relics. Consumers apply each field
 * where relevant — click endpoint reads clickPCMul, spawn loop reads
 * spawnSpeedMul, etc.
 *
 * All coefficients were tripled in the Phase 4 rebalance — Frugality
 * is hard to come by, so each chest needs to land an effect the
 * player feels.
 */
export type RelicEffects = {
  /** Additive bonus to spawn shiny chance. */
  shinyChanceBonus: number;
  /** Multiplier on helper PC/sec (1 + Σ 0.30 per level of helping_hand). */
  helperRateMul: number;
  /** Multiplier on every click PC. */
  clickPCMul: number;
  /** Multiplier on spawn interval (<1 = faster). */
  spawnSpeedMul: number;
  /** Bonus PC seeded at the start of each Prestige cycle. */
  prestigeStartBonusPC: number;
  /** Multiplier on Bank-It wallet ¢ payout. */
  bankPayoutMul: number;
  /** Per-poll bonus chance for a Coin Storm event. */
  stormChanceBonus: number;
  /** Additive bonus to ancient-spawn chance. */
  ancientChanceBonus: number;
  /** Flat PC added to every coin's base value (stacks with Penny Multiplier). */
  coinBaseBonus: number;
  /** Extra Frugality awarded on a Lost Wallet "Return It" (stacks on the base +1). */
  returnFrugalityBonus: number;
  /** Merge slide / ready-to-merge delay multiplier (<1 = faster).
   *  Merging Hands relic at lvl 1 sets this to 0.5 (twice as fast). */
  mergeSpeedMul: number;
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
  returnFrugalityBonus: 0,
  mergeSpeedMul: 1,
};

export function relicEffects(relics: RelicLevels): RelicEffects {
  const e: RelicEffects = { ...ZERO_EFFECTS };
  const lvl = (id: RelicId) => relics[id] ?? 0;
  e.shinyChanceBonus    += 0.03   * lvl("lucky_charm");
  e.helperRateMul       += 0.30   * lvl("helping_hand");
  e.clickPCMul          += 0.30   * lvl("midas_thumb");
  e.spawnSpeedMul       *= Math.pow(0.85, lvl("fast_fingers"));
  e.prestigeStartBonusPC += 3000  * lvl("thick_pockets");
  e.bankPayoutMul       += 0.15   * lvl("merchant_seal");
  e.stormChanceBonus    += 0.03   * lvl("rainmaker");
  e.ancientChanceBonus  += 0.0015 * lvl("ancient_idol");
  e.coinBaseBonus       += 15     * lvl("fortunes_eye");
  e.returnFrugalityBonus += 1     * lvl("saints_mark");
  // Merging Hands — single-rank legendary, halves both the merge
  // slide and the ready-to-merge cooldown. Applied multiplicatively
  // so future relics could stack additional speed-ups.
  if (lvl("merging_hands") > 0) e.mergeSpeedMul *= 0.5;
  return e;
}

// ============================================================
// PRESTIGE
// ============================================================

/**
 * Tiered prestige threshold — each prestige needs more than the
 * last so a high-prestige player has to actually grind back up
 * instead of perma-looping at the 100k floor.
 *
 *   First 10 prestiges: each adds +100k    (P1=100k, P10=1M)
 *   Prestige 11–20:     each adds +200k    (P11=1.2M, P20=3M)
 *   Prestige 21–30:     each adds +300k    (P21=3.3M, P30=6M)
 *   Beyond:             tier index keeps climbing by +100k/decade
 *
 * `prestigeCount` is the count BEFORE this prestige (the player has
 * already done that many). The return is the cents required to
 * trigger the (count+1)-th prestige.
 */
export function nextPrestigeThreshold(prestigeCount: number): number {
  let total = 0;
  for (let p = 1; p <= prestigeCount + 1; p++) {
    const tier = Math.ceil(p / 10);
    total += PRESTIGE_THRESHOLD_CENTS * tier;
  }
  return total;
}

/**
 * Bank Tokens awarded for prestiging with `currentCents` in pocket.
 * The cents themselves are consumed (the prestige reset wipes them
 * either way) — the more you've saved, the more tokens you get.
 *
 * Curve still flattens at high cents (sqrt of cents/4k) so the
 * token-per-cent rate keeps shrinking; the tiered threshold
 * pushes the entry point upward instead of touching the slope.
 *
 *   tokens = floor(sqrt(currentCents / 4000))   when above threshold
 *   tokens = 0                                  below threshold
 */
export function bankTokensFromCurrentCents(
  currentCents: number,
  prestigeCount: number = 0,
): number {
  if (currentCents < nextPrestigeThreshold(prestigeCount)) return 0;
  return Math.floor(Math.sqrt(currentCents / PRESTIGE_TOKEN_DIVISOR));
}

/** Whether the player has hit the threshold to prestige. */
export function canPrestige(currentCents: number, prestigeCount: number = 0): boolean {
  return currentCents >= nextPrestigeThreshold(prestigeCount);
}

/**
 * Legacy adapter — the wire still exposes a `tokensIfRolled` field
 * used by older clients. Returns the same number as
 * `bankTokensFromCurrentCents` so the response stays consistent.
 * @deprecated prefer `bankTokensFromCurrentCents`.
 */
export function bankTokensFromPrestige(currentCents: number, prestigeCount: number = 0): number {
  return bankTokensFromCurrentCents(currentCents, prestigeCount);
}

/**
 * Prestige Tithe — Frugality multiplier applied on every prestige.
 * Level → multiplier: 1=0.5, 2=0.6, 3=0.7, 4=0.8, 5=1.0.
 * Returns 0 when the upgrade isn't owned.
 */
export function prestigeTitheMultiplier(level: number): number {
  switch (level) {
    case 1: return 0.5;
    case 2: return 0.6;
    case 3: return 0.7;
    case 4: return 0.8;
    case 5: return 1.0;
    default: return 0;
  }
}

/** Bank Token cost to take a perm upgrade from `currentLevel` to `currentLevel + 1`. */
export function nextPermUpgradeCost(upgradeId: PermUpgradeId, currentLevel: number): number | null {
  const def = PERM_UPGRADES_BY_ID[upgradeId];
  if (!def) return null;
  if (currentLevel >= def.maxLevel) return null;
  return Math.ceil(def.baseCost * Math.pow(def.costMultiplier, currentLevel));
}

/**
 * Starting cents for a fresh Prestige cycle, given perm upgrades.
 *
 * Bigger Pockets is quadratic — seed = 1000 × level² PC. Slow at
 * the bottom, snaps to a clean 100k at maxed (lvl 10):
 *   L1 1k  ·  L2 4k  ·  L3 9k  ·  L4 16k  ·  L5 25k
 *   L6 36k ·  L7 49k ·  L8 64k ·  L9 81k  ·  L10 100k
 */
export function prestigeStartingCents(perm: PermLevels): number {
  const lvl = perm.bigger_pockets ?? 0;
  if (lvl <= 0) return 0;
  return 1000 * lvl * lvl;
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

// ============================================================
// CURRENT-VALUE LABELS
//
// Each card surfaces "Currently X" under the description so the
// player can see what their levels actually do without doing the
// math. Returns null when the upgrade is at level 0 (or the value
// has no useful per-level read, e.g. binary unlocks at level 0).
// ============================================================

export function upgradeCurrentValueLabel(id: UpgradeId, level: number): string | null {
  if (level <= 0) return null;
  switch (id) {
    case "sharper_eyes": {
      // Show actual spawn-rate increase — interval shrinks by 5%
      // per level but the spawn loop has a 100ms-interval floor, so
      // levels past ~L53 don't actually fire any faster. Compute
      // the effective interval against the floor and report rate.
      const targetInterval = 1500 * Math.pow(0.95, level);
      const effectiveInterval = Math.max(100, targetInterval);
      const rateMul = 1500 / effectiveInterval; // ≥ 1
      const pct = Math.round((rateMul - 1) * 100);
      return pct > 0 ? `${pct}% more spawns` : "—";
    }
    case "two_finger_pickup":
      // Gameplay caps the chance at 50% (Math.min(0.5, 0.05·lvl)).
      return `+${Math.min(50, level * 5)}% nearby-grab on click`;
    case "penny_multiplier":
      return `+${level * 10}% PC every coin`;
    case "coin_polish":
      return `+${level} PC every coin`;
    case "lucky_crack":
      // Per-upgrade contribution is uncapped here; total shiny
      // probability still has the natural 100% ceiling once
      // album / relics / blessings stack on top.
      return `+${level}% shiny chance`;
    case "vending_machines":
    case "parking_lot":
    case "laundry_day":
    case "boardwalk":
    case "grandpa_jar":
      // Spawn weight = 25/15/10/8/6 base + (10/7/5/4/3) × (lvl - 1).
      // Just show the level — exact pool weight is opaque to the player.
      return level === 1 ? "Unlocked" : `Level ${level} weight`;
    case "auto_picker": {
      // Auto-click loop floors at 150ms interval, so the effective
      // rate caps at ~6.67/sec regardless of level. Show the
      // honest cap.
      const targetInterval = 1000 / level;
      const effectiveInterval = Math.max(150, targetInterval);
      const rate = Math.floor(1000 / effectiveInterval);
      return `${rate} auto-click/sec`;
    }
    case "pile_it_up":
      return "Active";
    case "extra_hands":
      // Same 50% chance cap as Two-Finger Pickup.
      return `+${Math.min(50, level * 5)}% extra-coin spawn`;
    default:
      return null;
  }
}

export function permUpgradeCurrentValueLabel(id: PermUpgradeId, level: number): string | null {
  if (level <= 0) return null;
  switch (id) {
    case "bigger_pockets":
      return `Seeds ${(1000 * level * level).toLocaleString()} PC each prestige`;
    case "practice_eyes":
      return "Pennies +5 PC";
    case "vending_lifer":
      return "Nickels unlocked at start";
    case "old_hand":
      return `${OFFLINE_CAP_HOURS + level}h offline cap`;
    case "lucky_streak":
      return `+${level}% shiny`;
    case "generous_helpers":
      return `+${level * 25}% helper PC/sec`;
    case "higher_ceilings":
      return `+${level * 10} max levels per upgrade`;
    case "prestige_tithe":
      return `${prestigeTitheMultiplier(level)}× Frugality on every prestige`;
    default:
      return null;
  }
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

// ============================================================
// LOCAL-FIRST GAME STATE
//
// The browser owns the live simulation. This is the persisted shape
// the client tracks in memory and ships up to /save every 10s.
//
// One blob, all the data — no more normalized tables for active
// play. The legacy penny_pinchers_state / _upgrades / _helpers /
// _perm_upgrades tables are read once on first /load per user (to
// seed the blob from historical data) and then go cold.
// ============================================================

/** Current persisted game state. Schema version is stamped so we can
 *  evolve the shape safely in future migrations — bump VERSION and
 *  branch in `migrateLoadedState` if needed. */
export const PENNY_PINCHERS_STATE_VERSION = 1 as const;

export type PennyPinchersGameState = {
  version: typeof PENNY_PINCHERS_STATE_VERSION;
  /** Pinch Cents in pocket (the click currency). */
  cents: number;
  lifetimeClicks: number;
  lifetimePCEarned: number;
  /** UNIX ms — used to compute offline helper accrual on load. */
  lastTickAt: number | null;
  /** UNIX ms of the most recent /bank action (cosmetic stat only). */
  lastBankAt: number | null;
  dailyBankedCents: number;
  /** YYYY-MM-DD UTC — rolls over the daily counter when changed. */
  dailyBankedDay: string | null;
  prestigeCount: number;
  bankTokens: number;
  lifetimeBankedCents: number;
  lastPrestigeAt: number | null;
  frugality: number;
  /** Run upgrades — keyed by UpgradeId. Wiped on prestige. */
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Run helpers — keyed by HelperId. Wiped on prestige. */
  helpers: Partial<Record<HelperId, number>>;
  /** Permanent upgrades — keyed by PermUpgradeId. Survives prestige. */
  perm: Partial<Record<PermUpgradeId, number>>;
  /** Coin album — per-trait per-coin pickup counts. Survives prestige. */
  album: AlbumState;
  /** Relics — keyed by RelicId. Survives prestige. */
  relics: RelicLevels;
  /** Unlocked achievement ids. */
  achievementsUnlocked: AchievementId[];
};

export function freshGameState(): PennyPinchersGameState {
  return {
    version: PENNY_PINCHERS_STATE_VERSION,
    cents: 0,
    lifetimeClicks: 0,
    lifetimePCEarned: 0,
    lastTickAt: null,
    lastBankAt: null,
    dailyBankedCents: 0,
    dailyBankedDay: null,
    prestigeCount: 0,
    bankTokens: 0,
    lifetimeBankedCents: 0,
    lastPrestigeAt: null,
    frugality: 0,
    upgrades: {},
    helpers: {},
    perm: {},
    album: {},
    relics: {},
    achievementsUnlocked: [],
  };
}

// ============================================================
// PURE MUTATIONS
//
// Every action the client takes — click a coin, buy an upgrade,
// hire a helper, prestige, bank, etc. — is a pure function that
// reads a state and returns a new state. The client wires these
// into a reducer; the server uses them for /bank validation.
// ============================================================

/** Result of a mutation that might be rejected (insufficient funds, max level, etc).
 *  Discriminated by `ok` so TypeScript narrows cleanly after `if (!r.ok) return;`. */
export type MutationResult<Extra extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true; state: PennyPinchersGameState } & Extra)
  | { ok: false; error: string };

/** Bump lifetime click + PC counters, credit cents, increment album. */
export function applyClick(
  state: PennyPinchersGameState,
  click: { coinType: CoinId; traits: CoinTrait[]; mergedPC?: number | null },
): PennyPinchersGameState {
  const relicE = relicEffects(state.relics);
  const base = click.mergedPC ?? coinPCValue(click.coinType, state.upgrades, state.perm, relicE);
  const pc = Math.round(
    base *
      traitMultiplier(click.traits) *
      frugalityPCMultiplier(state.frugality) *
      albumPCBonus(state.album) *
      prestigePCMultiplier(state.prestigeCount) *
      relicE.clickPCMul,
  );
  const album: AlbumState = { ...state.album };
  for (const t of click.traits) {
    const page = { ...(album[t] ?? {}) } as Partial<Record<CoinId, number>>;
    page[click.coinType] = (page[click.coinType] ?? 0) + 1;
    album[t] = page;
  }
  return {
    ...state,
    cents: state.cents + pc,
    lifetimeClicks: state.lifetimeClicks + 1,
    lifetimePCEarned: state.lifetimePCEarned + pc,
    lastTickAt: Date.now(),
    album,
  };
}

export function applyBuyUpgrade(
  state: PennyPinchersGameState,
  upgradeId: UpgradeId,
): MutationResult<{ newLevel: number; cost: number }> {
  const def = UPGRADES_BY_ID[upgradeId];
  if (!def) return { ok: false, error: "bad_upgrade" };
  const currentLevel = state.upgrades[upgradeId] ?? 0;
  if (currentLevel >= effectiveUpgradeMaxLevel(def, state.perm)) return { ok: false, error: "max_level" };
  const cost = nextUpgradeCost(upgradeId, currentLevel, state.perm);
  if (cost == null) return { ok: false, error: "max_level" };
  if (state.cents < cost) return { ok: false, error: "insufficient_cents" };
  const newLevel = currentLevel + 1;
  return {
    ok: true,
    state: {
      ...state,
      cents: state.cents - cost,
      upgrades: { ...state.upgrades, [upgradeId]: newLevel },
    },
    newLevel,
    cost,
  };
}

/** Greedy "max buy" — repeatedly buys the cheapest currently-affordable
 *  upgrade until nothing is affordable (or every upgrade is maxed).
 *  Cheapest-first means a player can pour a billion PC into this and
 *  watch every available upgrade climb together, not just dump it all
 *  into one expensive lane. Iteration cap (5,000) is a defensive floor
 *  against runaway behaviour — the worst real case is ~900 buys
 *  (13 upgrades × ~70 levels max with Higher Ceilings). */
export function applyBuyMaxUpgrades(
  state: PennyPinchersGameState,
): { state: PennyPinchersGameState; bought: number; spent: number } {
  let working = state;
  let bought = 0;
  let spent = 0;
  for (let i = 0; i < 5_000; i++) {
    let cheapestId: UpgradeId | null = null;
    let cheapestCost = Number.POSITIVE_INFINITY;
    for (const def of UPGRADES) {
      const lvl = working.upgrades[def.id] ?? 0;
      if (lvl >= effectiveUpgradeMaxLevel(def, working.perm)) continue;
      const cost = nextUpgradeCost(def.id, lvl, working.perm);
      if (cost == null || cost > working.cents) continue;
      if (cost < cheapestCost) {
        cheapestCost = cost;
        cheapestId = def.id;
      }
    }
    if (!cheapestId) break;
    const result = applyBuyUpgrade(working, cheapestId);
    if (!result.ok) break;
    working = result.state;
    bought += 1;
    spent += result.cost;
  }
  return { state: working, bought, spent };
}

export function applyHireHelper(
  state: PennyPinchersGameState,
  helperId: HelperId,
): MutationResult<{ newCount: number; cost: number }> {
  if (!HELPERS_BY_ID[helperId]) return { ok: false, error: "bad_helper" };
  const currentCount = state.helpers[helperId] ?? 0;
  const cost = nextHelperCost(helperId, currentCount);
  if (cost == null) return { ok: false, error: "max_owned" };
  if (state.cents < cost) return { ok: false, error: "insufficient_cents" };
  const newCount = currentCount + 1;
  return {
    ok: true,
    state: {
      ...state,
      cents: state.cents - cost,
      helpers: { ...state.helpers, [helperId]: newCount },
      // Stamp lastTickAt so a brand-new helper doesn't back-credit
      // time when it didn't yet exist.
      lastTickAt: Date.now(),
    },
    newCount,
    cost,
  };
}

/** Greedy "max hire" for the Helpers tab — same pattern as
 *  applyBuyMaxUpgrades. Hires the cheapest currently-affordable
 *  helper in a loop until nothing's affordable. */
export function applyHireMaxHelpers(
  state: PennyPinchersGameState,
): { state: PennyPinchersGameState; hired: number; spent: number } {
  let working = state;
  let hired = 0;
  let spent = 0;
  for (let i = 0; i < 5_000; i++) {
    let cheapestId: HelperId | null = null;
    let cheapestCost = Number.POSITIVE_INFINITY;
    for (const def of HELPERS) {
      const owned = working.helpers[def.id] ?? 0;
      if (owned >= def.maxOwn) continue;
      const cost = nextHelperCost(def.id, owned);
      if (cost == null || cost > working.cents) continue;
      if (cost < cheapestCost) {
        cheapestCost = cost;
        cheapestId = def.id;
      }
    }
    if (!cheapestId) break;
    const result = applyHireHelper(working, cheapestId);
    if (!result.ok) break;
    working = result.state;
    hired += 1;
    spent += result.cost;
  }
  return { state: working, hired, spent };
}

export function applyBuyPermUpgrade(
  state: PennyPinchersGameState,
  upgradeId: PermUpgradeId,
): MutationResult<{ newLevel: number; cost: number; frugalityGained: number }> {
  if (!PERM_UPGRADES_BY_ID[upgradeId]) return { ok: false, error: "bad_upgrade" };
  const currentLevel = state.perm[upgradeId] ?? 0;
  const cost = nextPermUpgradeCost(upgradeId, currentLevel);
  if (cost == null) return { ok: false, error: "max_level" };
  if (state.bankTokens < cost) return { ok: false, error: "insufficient_tokens" };
  const newLevel = currentLevel + 1;
  return {
    ok: true,
    state: {
      ...state,
      bankTokens: state.bankTokens - cost,
      perm: { ...state.perm, [upgradeId]: newLevel },
    },
    newLevel,
    cost,
    frugalityGained: 0,
  };
}

export function applyBuyBlessing(
  state: PennyPinchersGameState,
  blessingId: BlessingId,
): MutationResult<{ cost: number; durationMs: number; frugalityGained: number }> {
  const def = BLESSINGS[blessingId];
  if (!def) return { ok: false, error: "bad_blessing" };
  if (state.cents < def.cost) return { ok: false, error: "insufficient_cents" };
  const frugalityGain = def.frugality ?? 0;
  const newFrugality = Math.min(FRUGALITY_MAX, state.frugality + frugalityGain);
  return {
    ok: true,
    state: {
      ...state,
      cents: state.cents - def.cost,
      frugality: newFrugality,
      lastTickAt: Date.now(),
    },
    cost: def.cost,
    durationMs: def.durationMs,
    frugalityGained: newFrugality - state.frugality,
  };
}

export function applyResolveLostWallet(
  state: PennyPinchersGameState,
  choice: "return" | "keep",
): PennyPinchersGameState & { pcGain: number } {
  const relicE = relicEffects(state.relics);
  const returnBonus = choice === "return" ? relicE.returnFrugalityBonus : 0;
  // Inline the constants — engine.ts can't import from a file that
  // imports back from engine.ts indirectly, so the constants we
  // need are local to the catalog and we use them by name.
  const LOST_WALLET_KEEP_FRUGALITY = -1;
  const LOST_WALLET_RETURN_FRUGALITY = 1;
  const LOST_WALLET_KEEP_PC = 500;
  const LOST_WALLET_KEEP_WEALTH_PCT = 0.15;
  const LOST_WALLET_KEEP_MAX_PC = 50_000;
  const delta =
    choice === "return"
      ? LOST_WALLET_RETURN_FRUGALITY + returnBonus
      : LOST_WALLET_KEEP_FRUGALITY;
  const pcGain =
    choice === "keep"
      ? Math.min(
          LOST_WALLET_KEEP_MAX_PC,
          LOST_WALLET_KEEP_PC + Math.floor(state.cents * LOST_WALLET_KEEP_WEALTH_PCT),
        )
      : 0;
  const nextFrugality = Math.min(FRUGALITY_MAX, Math.max(FRUGALITY_MIN, state.frugality + delta));
  return {
    ...state,
    cents: state.cents + pcGain,
    lifetimePCEarned: state.lifetimePCEarned + pcGain,
    frugality: nextFrugality,
    lastTickAt: Date.now(),
    pcGain,
  };
}

/** Roll one cushion's loot using the supplied RNG. */
export function applyCushionFlip(
  state: PennyPinchersGameState,
  rand01: () => number,
): { state: PennyPinchersGameState; lootId: CushionLootId; label: string; pcGain: number; tier: "lint" | "low" | "mid" | "high" | "jackpot"; frugalityGained: number } {
  const totalWeight = CUSHION_LOOT.reduce((sum, e) => sum + e.weight, 0);
  let r = rand01() * totalWeight;
  let pick: typeof CUSHION_LOOT[number] = CUSHION_LOOT[0];
  for (const entry of CUSHION_LOOT) {
    r -= entry.weight;
    if (r < 0) { pick = entry; break; }
  }
  const pcGain = Math.round(pick.pc * frugalityPCMultiplier(state.frugality));
  const frugalityGain = pick.frugality ?? 0;
  const newFrugality = Math.min(FRUGALITY_MAX, state.frugality + frugalityGain);
  return {
    state: {
      ...state,
      cents: state.cents + pcGain,
      lifetimePCEarned: state.lifetimePCEarned + pcGain,
      lifetimeClicks: state.lifetimeClicks + 1,
      frugality: newFrugality,
      lastTickAt: Date.now(),
    },
    lootId: pick.id,
    label: pick.label,
    pcGain,
    tier: pick.tier,
    frugalityGained: newFrugality - state.frugality,
  };
}

/** Roll a relic chest, charge Frugality, level up the rolled relic.
 *  Half-refunds on a maxed-out duplicate. */
export function applyOpenChest(
  state: PennyPinchersGameState,
  tier: ChestTier,
  rand01: () => number,
): MutationResult<{ relicId: RelicId; label: string; rarity: string; description: string; newLevel: number; maxLevel: number; duplicateAtMax: boolean; refund: number }> {
  const def = CHESTS[tier];
  if (!def) return { ok: false, error: "bad_tier" };
  if (state.frugality < def.cost) return { ok: false, error: "insufficient_frugality" };
  const rolled = rollRelicFromChest(tier, rand01);
  if (!rolled) return { ok: false, error: "roll_failed" };
  const relics: RelicLevels = { ...state.relics };
  const before = relics[rolled.id] ?? 0;
  const maxedOut = before >= rolled.maxLevel;
  const newLevel = Math.min(rolled.maxLevel, before + 1);
  relics[rolled.id] = newLevel;
  const refund = maxedOut ? Math.floor(def.cost / 2) : 0;
  const netCost = def.cost - refund;
  return {
    ok: true,
    state: {
      ...state,
      frugality: state.frugality - netCost,
      relics,
      lastTickAt: Date.now(),
    },
    relicId: rolled.id,
    label: rolled.label,
    rarity: rolled.rarity,
    description: rolled.description,
    newLevel,
    maxLevel: rolled.maxLevel,
    duplicateAtMax: maxedOut,
    refund,
  };
}

/** Roll It Up — wipe run state, award Bank Tokens proportional to cents sacrificed. */
export function applyPrestige(
  state: PennyPinchersGameState,
): MutationResult<{ awarded: number; frugalityGained: number }> {
  const tokens = bankTokensFromCurrentCents(state.cents, state.prestigeCount);
  if (tokens <= 0) return { ok: false, error: "below_threshold" };
  const now = Date.now();
  const relicE = relicEffects(state.relics);
  const seededCents = prestigeStartingCents(state.perm) + relicE.prestigeStartBonusPC;
  const newPrestigeCount = state.prestigeCount + 1;
  // Prestige Tithe — Frugality grant scales with prestige count
  // and the upgrade's multiplier (L1 0.5× → L5 1.0×), capped at
  // FRUGALITY_MAX. Uses the post-increment prestige count so the
  // grant reflects the prestige just achieved.
  const titheMul = prestigeTitheMultiplier(state.perm.prestige_tithe ?? 0);
  const frugalityGained = Math.max(
    0,
    Math.min(FRUGALITY_MAX - state.frugality, Math.floor(newPrestigeCount * titheMul)),
  );
  // Vending Lifer — auto-grant vending_machines L1 in the new run.
  const upgrades: Partial<Record<UpgradeId, number>> = {};
  if ((state.perm.vending_lifer ?? 0) >= 1) upgrades.vending_machines = 1;
  return {
    ok: true,
    state: {
      ...state,
      cents: seededCents,
      lifetimePCEarned: 0,
      // Career clicks survive — feels weird to lose them.
      lifetimeClicks: state.lifetimeClicks,
      upgrades,
      helpers: {},
      prestigeCount: newPrestigeCount,
      bankTokens: state.bankTokens + tokens,
      frugality: state.frugality + frugalityGained,
      lastPrestigeAt: now,
      lastTickAt: now,
    },
    awarded: tokens,
    frugalityGained,
  };
}

/** Bank PC → wallet ¢. Returns payout + new state with cents drained. */
export function applyBank(
  state: PennyPinchersGameState,
  nowMs: number = Date.now(),
): MutationResult<{ payoutCents: number; pcConsumed: number }> {
  if (state.cents <= 0) return { ok: false, error: "no_cents" };
  const relicE = relicEffects(state.relics);
  const payoutCents = Math.max(
    0,
    Math.round(bankPayoutCents(state.cents) * relicE.bankPayoutMul),
  );
  if (payoutCents <= 0) return { ok: false, error: "no_cents" };
  // BANK_PC_PER_WALLET_CENT is the conversion rate. Round UP so we
  // never undercharge the player.
  const pcConsumed = Math.min(state.cents, payoutCents * 4); // 4 = BANK_PC_PER_WALLET_CENT
  const remainingPC = Math.max(0, state.cents - pcConsumed);
  const todayUtc = new Date(nowMs).toISOString().slice(0, 10);
  const dailyBankedSoFar = state.dailyBankedDay === todayUtc ? state.dailyBankedCents : 0;
  return {
    ok: true,
    state: {
      ...state,
      cents: remainingPC,
      lastTickAt: nowMs,
      lastBankAt: nowMs,
      dailyBankedCents: dailyBankedSoFar + payoutCents,
      dailyBankedDay: todayUtc,
      lifetimeBankedCents: state.lifetimeBankedCents + payoutCents,
    },
    payoutCents,
    pcConsumed,
  };
}

/** Credit helper PC earned while the tab was hidden / the user was
 *  offline. Capped by `offlineCapHours` (extended by Old Hand). */
export function applyOfflineAccrual(
  state: PennyPinchersGameState,
  nowMs: number = Date.now(),
): { state: PennyPinchersGameState; accrued: number } {
  if (state.lastTickAt == null) {
    return {
      state: { ...state, lastTickAt: nowMs },
      accrued: 0,
    };
  }
  const relicE = relicEffects(state.relics);
  const rate = helperRatePcPerSec(state.helpers, state.perm, relicE);
  const accrued = offlinePCAccrued(rate, new Date(state.lastTickAt), state.perm, new Date(nowMs));
  if (accrued <= 0) {
    return { state: { ...state, lastTickAt: nowMs }, accrued: 0 };
  }
  return {
    state: {
      ...state,
      cents: state.cents + accrued,
      lifetimePCEarned: state.lifetimePCEarned + accrued,
      lastTickAt: nowMs,
    },
    accrued,
  };
}

/** Detect any newly-unlocked achievements + credit their bank-token
 *  + frugality rewards. Pure: returns the new state + the ids that
 *  just unlocked so the caller can pop toasts. */
export function applyAchievementSweep(
  state: PennyPinchersGameState,
): { state: PennyPinchersGameState; newlyUnlocked: AchievementId[] } {
  const already = new Set(state.achievementsUnlocked);
  const newly = detectNewUnlocks(
    {
      lifetimeClicks: state.lifetimeClicks,
      prestigeCount: state.prestigeCount,
      lifetimeBankedCents: state.lifetimeBankedCents,
      frugality: state.frugality,
      helpers: state.helpers,
      upgrades: state.upgrades,
      album: state.album,
      relics: state.relics,
    },
    already,
  );
  if (newly.length === 0) return { state, newlyUnlocked: [] };
  let tokenReward = 0;
  let frugalityReward = 0;
  for (const id of newly) {
    const def = ACHIEVEMENTS_BY_ID[id];
    if (!def) continue;
    tokenReward += def.reward;
    frugalityReward += def.frugalityReward ?? 0;
  }
  return {
    state: {
      ...state,
      bankTokens: state.bankTokens + tokenReward,
      frugality: Math.min(FRUGALITY_MAX, state.frugality + frugalityReward),
      achievementsUnlocked: [...state.achievementsUnlocked, ...newly],
    },
    newlyUnlocked: newly,
  };
}

/** Recover from a load that has a missing or malformed shape.
 *  Always returns a complete, well-formed state. Future schema
 *  versions branch here based on `loaded.version`. */
export function migrateLoadedState(loaded: unknown): PennyPinchersGameState {
  const fresh = freshGameState();
  if (!loaded || typeof loaded !== "object") return fresh;
  const raw = loaded as Partial<PennyPinchersGameState>;
  return {
    ...fresh,
    ...raw,
    version: PENNY_PINCHERS_STATE_VERSION,
    upgrades: { ...fresh.upgrades, ...(raw.upgrades ?? {}) },
    helpers: { ...fresh.helpers, ...(raw.helpers ?? {}) },
    perm: { ...fresh.perm, ...(raw.perm ?? {}) },
    album: { ...fresh.album, ...(raw.album ?? {}) },
    relics: { ...fresh.relics, ...(raw.relics ?? {}) },
    achievementsUnlocked: Array.isArray(raw.achievementsUnlocked) ? raw.achievementsUnlocked : [],
  };
}

