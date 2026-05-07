// Penny Pinchers — pure stateless game logic. Server validates with
// these helpers; client uses them for optimistic projections.

import {
  ACHIEVEMENTS,
  BANK_PC_PER_WALLET_CENT,
  BANK_TOKEN_DIVISOR,
  COINS,
  COIN_ORDER,
  DAILY_BANK_CAP,
  HELPERS_BY_ID,
  MAX_BANK_PAYOUT,
  MERGE_PROXIMITY_PX,
  OFFLINE_CAP_HOURS,
  PERM_UPGRADES_BY_ID,
  PRESTIGE_THRESHOLD_PC,
  TRAITS,
  UPGRADES_BY_ID,
  type AchievementId,
  type CoinId,
  type CoinTrait,
  type HelperId,
  type PermUpgradeId,
  type UpgradeId,
} from "./catalog";

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;
export type HelperCounts = Partial<Record<HelperId, number>>;
export type PermLevels = Partial<Record<PermUpgradeId, number>>;

// ============================================================
// COIN VALUE
// ============================================================

/** PC paid for clicking one coin of `coinType`, given current upgrades + perm bonuses. */
export function coinPCValue(
  coinType: CoinId,
  levels: UpgradeLevels,
  perm: PermLevels = {},
): number {
  const base = COINS[coinType].basePC;
  if (coinType === "penny") {
    // Practice Eyes (perm) gives +5 PC permanently; Penny Multiplier (run) gives +1 per level.
    const permBonus = (perm.practice_eyes ?? 0) * 5;
    return base + permBonus + (levels.penny_multiplier ?? 0);
  }
  return base;
}

/**
 * Server-clamped trait multiplier. The client tells us "this was
 * shiny", we trust it but cap at the trait's maxMultiplier so a
 * tampered client can never dump more than the configured ceiling.
 */
export function traitMultiplier(trait: CoinTrait | null | undefined): number {
  if (!trait) return 1;
  const def = TRAITS[trait];
  if (!def) return 1;
  return def.maxMultiplier;
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

/** Total PC produced per second across all owned helpers, with the Generous Helpers perm bonus applied. */
export function helperRatePcPerSec(helpers: HelperCounts, perm: PermLevels = {}): number {
  let rate = 0;
  for (const [id, count] of Object.entries(helpers) as [HelperId, number][]) {
    const def = HELPERS_BY_ID[id];
    if (!def) continue;
    rate += def.pcPerSec * count;
  }
  const permBonus = 1 + 0.25 * (perm.generous_helpers ?? 0);
  return rate * permBonus;
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
 * Compute the wallet ¢ payout for banking `cents` (PC) given the
 * day's already-banked total. Returns 0 when the day is capped.
 */
export function bankPayoutCents(cents: number, dailyBankedSoFar: number): number {
  if (cents <= 0) return 0;
  const raw = Math.floor(cents / BANK_PC_PER_WALLET_CENT);
  const capPerBank = MAX_BANK_PAYOUT;
  const capPerDay = Math.max(0, DAILY_BANK_CAP - dailyBankedSoFar);
  return Math.min(raw, capPerBank, capPerDay);
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
  rand: () => number = Math.random,
): CoinTrait | null {
  const luck = levels.lucky_crack ?? 0;
  const permLuck = perm.lucky_streak ?? 0;
  const shinyChance =
    TRAITS.shiny.baseChance + TRAITS.shiny.perLuckLevel * luck + 0.01 * permLuck;
  if (rand() < shinyChance) return "shiny";
  // Sticky only on penny / nickel — feels weird on big coins.
  if (coinType === "penny" || coinType === "nickel") {
    const stickyChance = TRAITS.sticky.baseChance + TRAITS.sticky.perLuckLevel * luck;
    if (rand() < stickyChance) return "sticky";
  }
  return null;
}

// ============================================================
// MERGING — proximity detection
// ============================================================

export type MergePoint = { id: number; coin: CoinId; x: number; y: number; spawnedAt: number };

/**
 * Find one merge cluster among the given points, if any. Returns
 * the ids to despawn + the new coin to spawn at the centroid.
 *
 * Linear scan, O(n²) — fine because the play area never holds more
 * than ~20 coins at once. We only return one merge per call so the
 * caller animates one fusion at a time.
 */
export function findMerge(
  points: MergePoint[],
  rule: { from: CoinId; count: number; to: CoinId },
  proximityPx: number = MERGE_PROXIMITY_PX,
): { ids: number[]; centroid: { x: number; y: number }; to: CoinId } | null {
  const candidates = points.filter((p) => p.coin === rule.from);
  if (candidates.length < rule.count) return null;
  for (const seed of candidates) {
    const cluster: MergePoint[] = [seed];
    for (const other of candidates) {
      if (other.id === seed.id) continue;
      if (cluster.length >= rule.count) break;
      const dx = other.x - seed.x;
      const dy = other.y - seed.y;
      if (dx * dx + dy * dy <= proximityPx * proximityPx) cluster.push(other);
    }
    if (cluster.length >= rule.count) {
      const used = cluster.slice(0, rule.count);
      const cx = used.reduce((s, p) => s + p.x, 0) / used.length;
      const cy = used.reduce((s, p) => s + p.y, 0) / used.length;
      return { ids: used.map((p) => p.id), centroid: { x: cx, y: cy }, to: rule.to };
    }
  }
  return null;
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
  helpers: HelperCounts;
  upgrades: UpgradeLevels;
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
