// Western Scratch-Off — server-side engine.
//
// V2 layout:
//   • Lucky Symbol (single corner cell) — revealed first.
//   • Bonus row of 3 cells — any matching the lucky symbol pays a
//     flat bonus on top of the main grid.
//   • 3×3 main grid + multiplier square (1 / 2 / 5 / 10).
//
// Outcome is pre-determined here, then a 3×3 grid + multiplier are
// laid out around it so the *visible* state matches the prize. Losing
// tickets are guaranteed at least one 2-of-3 "near miss" line (the
// single biggest psychological hook in real scratchers).

import { randInt, pick } from "../rng";
import { type ScratchDesign } from "./designs";

export type ScratchSymbol =
  | "horseshoe" | "boot" | "ace" | "dice"
  | "revolver" | "whiskey" | "cactus"
  | "gold" | "sheriff"
  | "dynamite"   // wild — reserved for v3
  | "bandit";    // instant lose — reserved for v3

export type Tier = "lose" | "small" | "medium" | "large" | "jackpot";

export type ScratchOutcome = {
  design: ScratchDesign;
  tier: Tier;
  /** Final coin payout (already includes the multiplier + any bonus). */
  payout: number;
  /** Multiplier reveal square, 1 / 2 / 5 / 10. */
  multiplier: 1 | 2 | 5 | 10;
  /** Row-major 3×3 of symbols. */
  grid: ScratchSymbol[];
  /** Index list of cells forming the winning line, or null on a loss. */
  winLine: number[] | null;
  /** Index list of the near-miss line on a loss. */
  nearMissLine: number[] | null;
  /** The corner Lucky Symbol — bonus row matches against this. */
  luckySymbol: ScratchSymbol;
  /** Bonus row (3 symbols). */
  bonusRow: ScratchSymbol[];
  /** Indices into `bonusRow` that match the lucky symbol. */
  bonusMatches: number[];
  /** Bonus prize portion of `payout` (so the client can show it). */
  bonusPayout: number;
  /** Number of sheriff stars revealed across the whole ticket. */
  sheriffStars: number;
  /** Daily-free ticket flag (skip the bet, elevated odds). */
  daily: boolean;
};

// =============================================================
// Tunables
// =============================================================

/** Tier probabilities for paid tickets. */
const TIER_WEIGHTS: { tier: Tier; weight: number }[] = [
  { tier: "lose",    weight: 0.750 },
  { tier: "small",   weight: 0.150 },
  { tier: "medium",  weight: 0.080 },
  { tier: "large",   weight: 0.019 },
  { tier: "jackpot", weight: 0.001 },
];

/** Daily free ticket: same shape but better odds, no jackpot. */
const TIER_WEIGHTS_DAILY: { tier: Tier; weight: number }[] = [
  { tier: "lose",    weight: 0.45 },
  { tier: "small",   weight: 0.45 },
  { tier: "medium",  weight: 0.09 },
  { tier: "large",   weight: 0.01 },
  { tier: "jackpot", weight: 0.00 },
];

/** Per-tier base payout multiple of cost (before the multiplier square). */
const TIER_BASE_MULT: Record<Tier, [number, number]> = {
  lose:    [0, 0],
  small:   [1, 2],
  medium:  [5, 10],
  large:   [50, 50],
  jackpot: [1000, 1000],
};

const SYMBOL_WEIGHTS: { symbol: ScratchSymbol; weight: number }[] = [
  { symbol: "horseshoe", weight: 17 },
  { symbol: "boot",      weight: 17 },
  { symbol: "ace",       weight: 16 },
  { symbol: "dice",      weight: 10 },
  { symbol: "revolver",  weight: 10 },
  { symbol: "whiskey",   weight: 10 },
  { symbol: "cactus",    weight: 7 },
  { symbol: "gold",      weight: 5 },
  { symbol: "sheriff",   weight: 3 },
];

const TIER_WINNING_POOL: Record<Tier, ScratchSymbol[]> = {
  lose:    [],
  small:   ["horseshoe", "boot", "ace"],
  medium:  ["dice", "revolver", "whiskey"],
  large:   ["cactus", "gold"],
  jackpot: ["sheriff"],
};

const MULTIPLIER_VALUES: (1 | 2 | 5 | 10)[] = [1, 1, 1, 2, 2, 5, 10];

/** Daily free ticket cost — used as the "1×" base for the payout math. */
const DAILY_BASE_COST = 5_000;

// =============================================================
// Public — generate a complete pre-determined ticket
// =============================================================

export function generateTicket(input: {
  cost: number;
  design: ScratchDesign;
  daily?: boolean;
}): ScratchOutcome {
  const { cost, design, daily = false } = input;
  const tier = pickTier(daily);

  // The base cost used for payout math. For paid tickets it's the
  // ticket cost; daily tickets use a fixed virtual cost so they pay
  // sensible amounts.
  const baseCost = daily ? DAILY_BASE_COST : cost;

  let grid: ScratchSymbol[];
  let winLine: number[] | null;
  let nearMissLine: number[] | null;
  let multiplier: 1 | 2 | 5 | 10;
  let mainPayout: number;

  if (tier === "lose") {
    grid = fillLoseGrid();
    winLine = null;
    nearMissLine = findNearMissLine(grid);
    multiplier = 1;
    mainPayout = 0;
  } else {
    const winSymbol = pick(TIER_WINNING_POOL[tier]);
    const [lo, hi] = TIER_BASE_MULT[tier];
    const baseMult = lo === hi ? lo : randInt(lo, hi);
    const m = pick(MULTIPLIER_VALUES);
    // Large + jackpot lock to 1× so the visible payout matches the
    // advertised prize exactly.
    multiplier = (tier === "large" || tier === "jackpot") ? 1 : m;
    const filled = fillWinGrid(winSymbol);
    grid = filled.grid;
    winLine = filled.winLine;
    nearMissLine = null;
    mainPayout = Math.floor(baseCost * baseMult * multiplier);
  }

  // Bonus row + lucky symbol. Lucky symbol is biased toward common
  // symbols so the bonus row hitting feels possible. Independently
  // distributed from the main grid.
  const luckySymbol = pickLuckySymbol(grid);
  const bonusRow: ScratchSymbol[] = [];
  const bonusMatches: number[] = [];
  // ~ 35% chance to seed at least one bonus match. Real scratchers
  // routinely include a match in the bonus row to pull the player in.
  const seedMatch = Math.random() < 0.35;
  for (let i = 0; i < 3; i++) {
    const matchPick = (seedMatch && i === 0) || Math.random() < 0.10;
    const sym = matchPick ? luckySymbol : pickSymbolExcept(luckySymbol);
    bonusRow.push(sym);
    if (sym === luckySymbol) bonusMatches.push(i);
  }
  // Bonus payout: 1× cost per match, doubled if the lucky symbol is
  // a "rare" tier symbol. Daily tickets get a flat 0.5× cost per match.
  const rare = luckySymbol === "gold" || luckySymbol === "sheriff" || luckySymbol === "cactus";
  const perMatch = daily ? Math.floor(baseCost * 0.5) : (rare ? baseCost * 2 : baseCost);
  const bonusPayout = bonusMatches.length * perMatch;

  // Count sheriff stars across the entire visible ticket. This drives
  // the meta-game collection that unlocks the quick-draw round.
  const sheriffStars =
    grid.filter((s) => s === "sheriff").length +
    bonusRow.filter((s) => s === "sheriff").length +
    (luckySymbol === "sheriff" ? 1 : 0);

  return {
    design,
    tier,
    payout: mainPayout + bonusPayout,
    multiplier,
    grid,
    winLine,
    nearMissLine,
    luckySymbol,
    bonusRow,
    bonusMatches,
    bonusPayout,
    sheriffStars,
    daily,
  };
}

// =============================================================
// Internals
// =============================================================

function pickTier(daily: boolean): Tier {
  const table = daily ? TIER_WEIGHTS_DAILY : TIER_WEIGHTS;
  const r = Math.random();
  let acc = 0;
  for (const { tier, weight } of table) {
    acc += weight;
    if (r < acc) return tier;
  }
  return "lose";
}

function pickSymbol(): ScratchSymbol {
  const total = SYMBOL_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const { symbol, weight } of SYMBOL_WEIGHTS) {
    r -= weight;
    if (r <= 0) return symbol;
  }
  return SYMBOL_WEIGHTS[0].symbol;
}

function pickSymbolExcept(except: ScratchSymbol): ScratchSymbol {
  for (let i = 0; i < 8; i++) {
    const s = pickSymbol();
    if (s !== except) return s;
  }
  return except === "boot" ? "horseshoe" : "boot";
}

function pickLuckySymbol(grid: ScratchSymbol[]): ScratchSymbol {
  // 60% chance the lucky symbol is one already on the grid (so the
  // player feels the anticipation as the bonus row reveals); otherwise
  // pick a fresh weighted symbol.
  if (Math.random() < 0.6) return pick(grid);
  return pickSymbol();
}

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function pickLine(): number[] {
  return LINES[randInt(0, LINES.length - 1)];
}

function fillWinGrid(winSymbol: ScratchSymbol): { grid: ScratchSymbol[]; winLine: number[] } {
  const winLine = pickLine();
  const grid: ScratchSymbol[] = new Array(9);
  for (const idx of winLine) grid[idx] = winSymbol;
  for (let i = 0; i < 9; i++) {
    if (grid[i] !== undefined) continue;
    grid[i] = drawNonConflictingSymbol(grid, i, winSymbol, winLine);
  }
  return { grid, winLine };
}

function drawNonConflictingSymbol(
  grid: ScratchSymbol[],
  i: number,
  winSymbol: ScratchSymbol,
  winLine: number[],
): ScratchSymbol {
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = pickSymbol();
    if (wouldCreateConflictingLine(grid, i, s, winLine)) continue;
    return s;
  }
  return winSymbol === "boot" ? "horseshoe" : "boot";
}

function wouldCreateConflictingLine(
  grid: ScratchSymbol[],
  i: number,
  s: ScratchSymbol,
  winLine: number[],
): boolean {
  for (const line of LINES) {
    if (!line.includes(i)) continue;
    if (sameLine(line, winLine)) continue;
    let count = 0;
    let known = 0;
    for (const idx of line) {
      const cell = idx === i ? s : grid[idx];
      if (cell === undefined) continue;
      known++;
      if (cell === s) count++;
    }
    if (known === 3 && count === 3) return true;
  }
  return false;
}

function sameLine(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function fillLoseGrid(): ScratchSymbol[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    const grid = naiveFill();
    if (hasAnyThreeLine(grid)) continue;
    if (!hasNearMissLine(grid)) {
      const line = pickLine();
      const sym = grid[line[0]];
      grid[line[1]] = sym;
      if (hasAnyThreeLine(grid)) continue;
    }
    if (!hasAnyThreeLine(grid) && hasNearMissLine(grid)) return grid;
  }
  return [
    "horseshoe", "horseshoe", "boot",
    "boot", "boot", "horseshoe",
    "ace", "dice", "revolver",
  ];
}

function naiveFill(): ScratchSymbol[] {
  return Array.from({ length: 9 }, () => pickSymbol());
}

function hasAnyThreeLine(grid: ScratchSymbol[]): boolean {
  return LINES.some(([a, b, c]) => grid[a] === grid[b] && grid[b] === grid[c]);
}

function findNearMissLine(grid: ScratchSymbol[]): number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const cells = [grid[a], grid[b], grid[c]];
    const counts: Partial<Record<ScratchSymbol, number>> = {};
    for (const s of cells) counts[s] = (counts[s] ?? 0) + 1;
    const max = Math.max(...Object.values(counts) as number[]);
    if (max === 2) return line;
  }
  return null;
}

function hasNearMissLine(grid: ScratchSymbol[]): boolean {
  return findNearMissLine(grid) !== null;
}

// =============================================================
// Quick-draw mini-game (server-trusted reaction-time → multiplier)
// =============================================================

/** Reaction-time-to-multiplier curve for the quick-draw bonus round. */
export function quickDrawMultiplier(reactionMs: number): number {
  // <120ms is suspicious / press-on-buzzer — clamp to 0.
  if (!Number.isFinite(reactionMs) || reactionMs < 120) return 0;
  if (reactionMs <= 200) return 20;
  if (reactionMs <= 280) return 12;
  if (reactionMs <= 360) return 8;
  if (reactionMs <= 480) return 4;
  if (reactionMs <= 700) return 2;
  return 1;
}

/** Quick-draw payout = base × multiplier(reactionMs). */
export const QUICK_DRAW_BASE = 5_000;
