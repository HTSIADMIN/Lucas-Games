// =============================================================
// "Boomtown" — 5-reel × 4-row hold-and-spin slot.
//
// RTP target: ~96%.
//
// Symbol set:
//   BOOT, GUN, STAR, GOLD, SHERIFF (wild), COIN (cash, has a value),
//   BUILDING_T1..T5 (only on reel 5).
//
// Wins:
//   - Lines: 20 fixed paylines, 3+ matching from leftmost reel.
//     SHERIFF subs for any non-COIN, non-BUILDING symbol.
//   - Coins: each visible COIN pays its stamped value × bet/reference, but
//     coins do not pay on lines — their value is collected on bonus only.
//
// Hold-and-spin trigger: 6+ COIN symbols on a single base spin.
//
// Bonus loop:
//   - Reels respin showing only blanks and COIN symbols (and BUILDING on reel 5).
//   - Each new coin sticks; respins reset to 3.
//   - Three "dud" respins in a row → bonus ends.
//   - Filling all 20 cells → grand jackpot regardless of tier.
//   - Each BUILDING that lands during bonus upgrades the tier (capped at 5).
//   - At end: payout = sum(visible coin values) × tier multiplier.
//
// Persistent meter: every base spin adds 1..3 ticks to the user's slots_meter.
//                   At 1000 the next spin is guaranteed to trigger the bonus
//                   (we force ≥6 coins to drop). Meter resets to 0 after.
//
// Reference bet: payouts are denominated against the player's bet. Coin
// values, line wins, and jackpots all scale linearly.
// =============================================================

import { randInt, randomInt } from "../rng";

export type BaseSym =
  | "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF"
  | "COIN" | "BUILDING";

// Reel cell descriptor. For COIN the cashValue field is set (¢).
// For BUILDING the buildingTier field is 1..5.
export type ReelCell =
  | { kind: "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF" }
  | { kind: "COIN"; cashValue: number }
  | { kind: "BUILDING"; tier: number };

// 20 fixed paylines on a 5×4 grid (row indices 0..3 for each of 5 reels).
// L→R reads and standard "everything connects" coverage.
export const PAYLINES: number[][] = [
  // Straight rows
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  // V's
  [0, 1, 2, 1, 0],
  [3, 2, 1, 2, 3],
  // Inverted V's
  [1, 0, 0, 0, 1],
  [2, 3, 3, 3, 2],
  // Stair
  [0, 0, 1, 2, 3],
  [3, 3, 2, 1, 0],
  // Zigzags
  [1, 0, 1, 0, 1],
  [2, 3, 2, 3, 2],
  // Mid-anchored
  [1, 1, 2, 1, 1],
  [2, 2, 1, 2, 2],
  [0, 1, 0, 1, 0],
  [3, 2, 3, 2, 3],
  [1, 2, 1, 2, 1],
  [2, 1, 2, 1, 2],
  [0, 1, 1, 1, 0],
  [3, 2, 2, 2, 3],
];

// Pay multipliers (× bet/20 — each line contributes per-line at 1/20th the bet).
// Match-of-X for matching from leftmost reel onwards.
const LINE_PAYS: Record<"BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF", { 3: number; 4: number; 5: number }> = {
  BOOT:    { 3: 1,  4: 3,   5: 8 },
  GUN:     { 3: 1, 4: 5,   5: 14 },
  STAR:    { 3: 2,  4: 8,   5: 25 },
  GOLD:    { 3: 4,  4: 15,  5: 60 },
  SHERIFF: { 3: 8,  4: 30,  5: 150 },
};

// Per-reel symbol weights. Reels 1..3 carry mostly the standard symbols;
// reels 4..5 are slightly hotter for COIN. Reel 5 is the only place a
// BUILDING ever lands (in the base game).
//
// Tuned for ~96% RTP. Coin weights are intentionally lean so the bonus
// trigger rate stays around 1/450 spins and individual coin payouts can
// stack without the bonus settle exploding into 1000×+ bet territory.
const REEL_WEIGHTS: { sym: BaseSym; w: number }[][] = [
  // Reel 1
  [
    { sym: "BOOT", w: 40 },
    { sym: "GUN", w: 32 },
    { sym: "STAR", w: 18 },
    { sym: "GOLD", w: 9 },
    { sym: "SHERIFF", w: 3 },
    { sym: "COIN", w: 8 },
  ],
  // Reel 2
  [
    { sym: "BOOT", w: 38 },
    { sym: "GUN", w: 30 },
    { sym: "STAR", w: 18 },
    { sym: "GOLD", w: 10 },
    { sym: "SHERIFF", w: 4 },
    { sym: "COIN", w: 10 },
  ],
  // Reel 3
  [
    { sym: "BOOT", w: 36 },
    { sym: "GUN", w: 30 },
    { sym: "STAR", w: 18 },
    { sym: "GOLD", w: 10 },
    { sym: "SHERIFF", w: 4 },
    { sym: "COIN", w: 12 },
  ],
  // Reel 4
  [
    { sym: "BOOT", w: 34 },
    { sym: "GUN", w: 28 },
    { sym: "STAR", w: 18 },
    { sym: "GOLD", w: 10 },
    { sym: "SHERIFF", w: 5 },
    { sym: "COIN", w: 13 },
  ],
  // Reel 5 — adds BUILDING and slightly more COIN
  [
    { sym: "BOOT", w: 30 },
    { sym: "GUN", w: 26 },
    { sym: "STAR", w: 16 },
    { sym: "GOLD", w: 9 },
    { sym: "SHERIFF", w: 4 },
    { sym: "COIN", w: 15 },
    { sym: "BUILDING", w: 7 },
  ],
];

// Cash-coin value table (per-coin value as a multiplier of bet/20).
// I.e. with a 1000¢ bet, a "5×" coin is worth 5 × (1000 / 20) = 250¢.
// Probabilities sum to 1.0.
//
// Tuned down from the launch values: the old top end (50× / 100×) combined
// with the T5 tier multiplier produced single-coin payouts of >100,000¢ on
// a 1000¢ bet. The new ceiling at 25× keeps the rare payouts thrilling
// without snapping the budget.
const COIN_VALUE_TABLE: { mult: number; p: number }[] = [
  { mult: 1,    p: 0.45 }, // small (50¢ at 1000 bet)
  { mult: 2,    p: 0.27 },
  { mult: 3,    p: 0.15 },
  { mult: 5,    p: 0.08 },
  { mult: 10,   p: 0.04 },
  { mult: 25,   p: 0.01 }, // top-tier coin (was 100×)
];

// Building tier weights (only when BUILDING rolls on reel 5). T5 is the
// progressive grand jackpot ("Boomtown") and is rare.
const BUILDING_TIER_TABLE: { tier: number; p: number }[] = [
  { tier: 1, p: 0.55 }, // Tent
  { tier: 2, p: 0.28 }, // Saloon
  { tier: 3, p: 0.12 }, // Town
  { tier: 4, p: 0.045 }, // Frontier
  { tier: 5, p: 0.005 }, // Boomtown — grand
];

// Bonus end-of-bonus tier multipliers, applied to the locked coin total.
// Reduced from 2/5/10/25/100 — the old T5 + top coin combo blew through
// the 96% RTP target.
export const TIER_MULTIPLIER: Record<number, number> = {
  1: 1.5,  // Tent
  2: 3,    // Saloon
  3: 6,    // Town
  4: 12,   // Frontier
  5: 25,   // Boomtown (grand)
};

export const TIER_LABEL: Record<number, string> = {
  1: "Tent",
  2: "Saloon",
  3: "Town",
  4: "Frontier",
  5: "Boomtown",
};

const METER_FULL = 500;
const METER_GAIN_MIN = 1;
const METER_GAIN_MAX = 3;

// =============================================================
// Spin core
// =============================================================

function rollWeighted<T extends { w?: number; p?: number }>(table: T[], totalKey: "w" | "p"): T {
  if (totalKey === "w") {
    const total = table.reduce((s, x) => s + (x.w as number), 0);
    let r = randomInt(0, total);
    for (const item of table) { r -= item.w as number; if (r < 0) return item; }
    return table[table.length - 1];
  } else {
    // float p; scale up to ints for crypto rng
    const SCALE = 100_000;
    const total = Math.round(table.reduce((s, x) => s + (x.p as number), 0) * SCALE);
    let r = randomInt(0, total);
    for (const item of table) { r -= Math.round((item.p as number) * SCALE); if (r < 0) return item; }
    return table[table.length - 1];
  }
}

function pickReelCell(reelIdx: number): ReelCell {
  const sym = rollWeighted(REEL_WEIGHTS[reelIdx], "w").sym;
  if (sym === "COIN") {
    const mult = rollWeighted(COIN_VALUE_TABLE, "p").mult;
    return { kind: "COIN", cashValue: mult };
  }
  if (sym === "BUILDING") {
    const tier = rollWeighted(BUILDING_TIER_TABLE, "p").tier;
    return { kind: "BUILDING", tier };
  }
  return { kind: sym };
}

// Force at least N coins on the next spin by re-rolling cells until we hit
// the threshold. Used for the "meter full" guarantee. We bias by replacing
// random cells (preserving reel index for value distribution).
function forceCoins(grid: ReelCell[][], minCoins: number) {
  const FLAT_COINS = () => grid.flat().filter((c) => c.kind === "COIN").length;
  let attempts = 0;
  while (FLAT_COINS() < minCoins && attempts < 60) {
    attempts++;
    // Pick a random non-COIN cell and re-roll it as a COIN with a value.
    const r = randomInt(0, 5);
    const row = randomInt(0, 4);
    const c = grid[r][row];
    if (c.kind === "COIN") continue;
    grid[r][row] = pickReelCell(r);
    if (grid[r][row].kind !== "COIN") {
      // Replace with explicit coin
      const mult = rollWeighted(COIN_VALUE_TABLE, "p").mult;
      grid[r][row] = { kind: "COIN", cashValue: mult };
    }
  }
}

export type LineWin = {
  lineIndex: number;       // 0..19
  symbol: "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF";
  count: number;           // 3, 4, or 5
  payout: number;          // ¢
};

export type BaseSpinResult = {
  // 5 columns × 4 rows. Indexed grid[reelIdx][rowIdx].
  grid: ReelCell[][];
  // Line wins (no coins included).
  lineWins: LineWin[];
  linePayout: number;      // ¢
  // Bonus trigger metadata.
  triggerCoinCount: number;
  bonusTriggered: boolean;
  // Building landed on this spin (reel 5 only). Used to set initial tier.
  bonusStartTier: number | null;
  // Meter delta for this spin.
  meterGain: number;
  meterAfter: number;
  meterForcedThisSpin: boolean;
};

/**
 * Roll the 5×4 grid and resolve line wins. The caller is responsible for
 * wallet debits/credits and persisting bonus runs.
 *
 * @param bet     stake in cents
 * @param meterIn current persistent meter value (0..METER_FULL)
 */
export function baseSpin(bet: number, meterIn: number): BaseSpinResult {
  // 1. Roll cells per reel
  const grid: ReelCell[][] = [];
  for (let r = 0; r < 5; r++) {
    const col: ReelCell[] = [];
    for (let row = 0; row < 4; row++) col.push(pickReelCell(r));
    grid.push(col);
  }

  // 2. Meter logic — if full, force a guaranteed bonus this spin.
  const meterForcedThisSpin = meterIn >= METER_FULL;
  if (meterForcedThisSpin) forceCoins(grid, 6);

  // 3. Resolve line wins. SHERIFF substitutes for any payable symbol.
  const lineWins: LineWin[] = [];
  for (let i = 0; i < PAYLINES.length; i++) {
    const line = PAYLINES[i];
    const cells = line.map((row, reelIdx) => grid[reelIdx][row]);
    // Anchor symbol: first non-WILD payable on the line. SHERIFF anchors as
    // SHERIFF if the entire line is sheriffs.
    let anchor: "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF" | null = null;
    for (const c of cells) {
      if (c.kind === "BOOT" || c.kind === "GUN" || c.kind === "STAR" || c.kind === "GOLD") {
        anchor = c.kind;
        break;
      }
    }
    if (!anchor) {
      // All non-anchorable (sheriffs, coins, buildings, etc.). If everything
      // is SHERIFF count it as 5 sheriffs.
      if (cells.every((c) => c.kind === "SHERIFF")) anchor = "SHERIFF";
    }
    if (!anchor) continue;
    let count = 0;
    for (const c of cells) {
      const matches = c.kind === anchor || c.kind === "SHERIFF";
      if (matches) count++;
      else break;
    }
    if (count >= 3) {
      const baseMult = LINE_PAYS[anchor][count as 3 | 4 | 5];
      const payout = Math.floor((bet / 20) * baseMult);
      if (payout > 0) {
        lineWins.push({ lineIndex: i, symbol: anchor, count, payout });
      }
    }
  }
  const linePayout = lineWins.reduce((s, l) => s + l.payout, 0);

  // 4. Bonus trigger detection — count COIN cells.
  let triggerCoinCount = 0;
  for (const col of grid) for (const c of col) if (c.kind === "COIN") triggerCoinCount++;
  const bonusTriggered = triggerCoinCount >= 6;

  // 5. Bonus start tier — if a BUILDING is on reel 5 at trigger, use that.
  let bonusStartTier: number | null = null;
  if (bonusTriggered) {
    let bestTier = 0;
    for (const c of grid[4]) if (c.kind === "BUILDING" && c.tier > bestTier) bestTier = c.tier;
    bonusStartTier = bestTier > 0 ? bestTier : 1;
  }

  // 6. Meter — if forced this spin, reset to 0; otherwise tick up.
  let meterAfter = meterIn;
  let meterGain = 0;
  if (meterForcedThisSpin) {
    meterAfter = 0;
    meterGain = -meterIn;
  } else {
    meterGain = randInt(METER_GAIN_MIN, METER_GAIN_MAX);
    meterAfter = Math.min(METER_FULL, meterIn + meterGain);
  }

  return {
    grid,
    lineWins,
    linePayout,
    triggerCoinCount,
    bonusTriggered,
    bonusStartTier,
    meterGain,
    meterAfter,
    meterForcedThisSpin,
  };
}

// =============================================================
// Hold-and-spin bonus
// =============================================================

// Cell stored on the bonus grid. Locked cells stay across respins.
// A locked cell is either:
//   - a coin (has a value, no building)
//   - a building (no value, has a tier 1..5)
export type BonusCell =
  | { value: null; locked: false }
  | { value: number; locked: true; building?: undefined }
  | { value: null; locked: true; building: number };

// Cell rolled during a bonus respin.
export type BonusRoll =
  | { kind: "BLANK" }
  | { kind: "COIN"; cashValue: number }
  | { kind: "BUILDING"; tier: number };  // reel 5 only

const BONUS_REEL_WEIGHTS: { sym: "BLANK" | "COIN" | "BUILDING"; w: number }[][] = [
  // Reels 1..4: blanks dominate, no buildings.
  // Coin density gradually decreases with each successful respin via the
  // "respins_left == 3 means we're early" logic — but for simplicity we
  // keep weights flat and let the natural variance carry it.
  [{ sym: "BLANK", w: 78 }, { sym: "COIN", w: 22 }],
  [{ sym: "BLANK", w: 78 }, { sym: "COIN", w: 22 }],
  [{ sym: "BLANK", w: 78 }, { sym: "COIN", w: 22 }],
  [{ sym: "BLANK", w: 78 }, { sym: "COIN", w: 22 }],
  // Reel 5 — building chance present too.
  [{ sym: "BLANK", w: 70 }, { sym: "COIN", w: 22 }, { sym: "BUILDING", w: 8 }],
];

function rollBonusReelCell(reelIdx: number): BonusRoll {
  const sym = rollWeighted(BONUS_REEL_WEIGHTS[reelIdx], "w").sym;
  if (sym === "COIN") {
    const mult = rollWeighted(COIN_VALUE_TABLE, "p").mult;
    return { kind: "COIN", cashValue: mult };
  }
  if (sym === "BUILDING") {
    const tier = rollWeighted(BUILDING_TIER_TABLE, "p").tier;
    return { kind: "BUILDING", tier };
  }
  return { kind: "BLANK" };
}

export type BonusRespinResult = {
  // The 20-cell board after this respin (locked cells preserved).
  board: BonusCell[];
  // New cells that were freshly locked this respin (board-index, value).
  newCoins: { idx: number; value: number }[];
  // New buildings that locked this respin (board-index, tier).
  newBuildings: { idx: number; tier: number }[];
  // Building tier (highest seen so far this bonus, capped at 5).
  newTier: number;
  // Bonus state flags.
  finished: boolean;
  filledScreen: boolean;
  respinsLeft: number;
  // Count of locked cells (coins + buildings combined).
  coinsLocked: number;
};

/**
 * Run one respin on an in-progress bonus board. Locked cells stay; unlocked
 * cells get freshly rolled. Both COINs and BUILDINGs lock their cells —
 * buildings don't pay but they take up a cell + upgrade tier.
 */
export function bonusRespin(input: {
  board: BonusCell[];          // length 20, row-major (5 reels × 4 rows)
  respinsLeft: number;
  coinsLocked: number;          // really "lockedCells"; kept name for column compat
  buildingTier: number;
}): BonusRespinResult & { tier: number } {
  const { board: prev, respinsLeft, buildingTier } = input;
  const board: BonusCell[] = prev.map((c) => ({ ...c }));
  const newCoins: { idx: number; value: number }[] = [];
  const newBuildings: { idx: number; tier: number }[] = [];
  let newTier = buildingTier;

  for (let r = 0; r < 5; r++) {
    for (let row = 0; row < 4; row++) {
      const idx = r * 4 + row;
      if (board[idx].locked) continue;
      const roll = rollBonusReelCell(r);
      if (roll.kind === "COIN") {
        board[idx] = { value: roll.cashValue, locked: true };
        newCoins.push({ idx, value: roll.cashValue });
      } else if (roll.kind === "BUILDING") {
        // Buildings now also lock their cell so they stay visible across
        // respins. They don't add to the coin pool but they do count
        // toward the 20-cell fill-the-screen check, and the highest tier
        // seen sets the bonus multiplier.
        board[idx] = { value: null, locked: true, building: roll.tier };
        newBuildings.push({ idx, tier: roll.tier });
        if (roll.tier > newTier) newTier = roll.tier;
      }
    }
  }

  // Count of all locked cells (coins + buildings) — this is what drives
  // the fill-screen check and the locked-cells counter shown to the user.
  const totalLocked = board.filter((c) => c.locked).length;
  const filledScreen = totalLocked >= 20;
  // The "any new lock resets the counter" rule applies to BOTH new coins
  // AND new buildings — landing a building during a respin is a real
  // gameplay event worth resetting on.
  const anyNewLocks = newCoins.length + newBuildings.length > 0;
  const nextRespinsLeft = anyNewLocks ? 3 : Math.max(0, respinsLeft - 1);
  const finished = filledScreen || nextRespinsLeft === 0;

  return {
    board,
    newCoins,
    newBuildings,
    newTier,
    tier: newTier,
    finished,
    filledScreen,
    respinsLeft: nextRespinsLeft,
    coinsLocked: totalLocked,
  };
}

/**
 * Compute the final bonus payout: sum of locked coin values × tier multiplier × bet/20.
 * filledScreen forces tier to 5 ("Boomtown") regardless of what was collected.
 */
export function settleBonus(input: {
  bet: number;
  board: BonusCell[];
  buildingTier: number;
  filledScreen: boolean;
}): { payout: number; tier: number; coinTotal: number } {
  const tier = input.filledScreen ? 5 : input.buildingTier;
  const mult = TIER_MULTIPLIER[tier] ?? 2;
  const coinTotal = input.board.reduce((s, c) => s + (c.value ?? 0), 0);
  const reference = input.bet / 20;
  const payout = Math.floor(coinTotal * mult * reference);
  return { payout, tier, coinTotal };
}

// =============================================================
// Initial bonus board from a triggering base spin.
// =============================================================
export function buildInitialBonusBoard(triggerGrid: ReelCell[][]): {
  board: BonusCell[];
  coinsLocked: number;     // total locked cells (coins + buildings)
} {
  const board: BonusCell[] = [];
  let lockedCells = 0;
  for (let r = 0; r < 5; r++) {
    for (let row = 0; row < 4; row++) {
      const c = triggerGrid[r][row];
      if (c.kind === "COIN") {
        board.push({ value: c.cashValue, locked: true });
        lockedCells++;
      } else if (c.kind === "BUILDING") {
        // Lock the building cell into the bonus board so the player can
        // still see what they triggered with on reel 5.
        board.push({ value: null, locked: true, building: c.tier });
        lockedCells++;
      } else {
        board.push({ value: null, locked: false });
      }
    }
  }
  return { board, coinsLocked: lockedCells };
}

// =============================================================
// Convenience: convert a ReelCell to a transport-friendly DTO for the client.
// =============================================================
export function cellToWire(c: ReelCell):
  | { kind: "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF" }
  | { kind: "COIN"; cashValue: number; coinPayout?: number }
  | { kind: "BUILDING"; tier: number; tierLabel: string } {
  if (c.kind === "COIN") return { kind: "COIN", cashValue: c.cashValue };
  if (c.kind === "BUILDING") return { kind: "BUILDING", tier: c.tier, tierLabel: TIER_LABEL[c.tier] };
  return { kind: c.kind };
}

// Public meter constants for the client.
export const METER = { full: METER_FULL };
