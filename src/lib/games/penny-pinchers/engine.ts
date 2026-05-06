// Penny Pinchers — pure stateless game logic. Server validates with
// these helpers; client uses them for optimistic projections.

import {
  BANK_PC_PER_WALLET_CENT,
  COINS,
  COIN_ORDER,
  DAILY_BANK_CAP,
  HELPERS_BY_ID,
  MAX_BANK_PAYOUT,
  OFFLINE_CAP_HOURS,
  UPGRADES_BY_ID,
  type CoinId,
  type HelperId,
  type UpgradeId,
} from "./catalog";

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;
export type HelperCounts = Partial<Record<HelperId, number>>;

// ============================================================
// COIN VALUE
// ============================================================

/** PC paid for clicking one coin of `coinType`, given current upgrades. */
export function coinPCValue(coinType: CoinId, levels: UpgradeLevels): number {
  const base = COINS[coinType].basePC;
  if (coinType === "penny") {
    // Penny Multiplier adds +1 PC per level on top of the base 1 PC.
    return base + (levels.penny_multiplier ?? 0);
  }
  return base;
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

/** Total PC produced per second across all owned helpers. */
export function helperRatePcPerSec(helpers: HelperCounts): number {
  let rate = 0;
  for (const [id, count] of Object.entries(helpers) as [HelperId, number][]) {
    const def = HELPERS_BY_ID[id];
    if (!def) continue;
    rate += def.pcPerSec * count;
  }
  return rate;
}

/**
 * Compute PC accrued by helpers between `lastTickAt` and `now`,
 * capped at OFFLINE_CAP_HOURS of gap so a player who comes back
 * after a week doesn't get a free trillion.
 */
export function offlinePCAccrued(
  rate: number,
  lastTickAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastTickAt || rate <= 0) return 0;
  const elapsedMs = now.getTime() - lastTickAt.getTime();
  if (elapsedMs <= 0) return 0;
  const cappedMs = Math.min(elapsedMs, OFFLINE_CAP_HOURS * 60 * 60 * 1000);
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
