// Western Scratch-Off — server-side engine.
//
// Outcome is pre-determined here, then a 3×3 grid + multiplier are
// laid out around it so the *visible* state matches the prize. Losing
// tickets are guaranteed at least one 2-of-3 "near miss" line (real
// scratchers do this; it's the single biggest psychological hook).

import { randInt, pick } from "../rng";

export type ScratchSymbol =
  | "horseshoe"
  | "boot"
  | "ace"
  | "dice"
  | "revolver"
  | "whiskey"
  | "cactus"
  | "gold"
  | "sheriff"
  | "dynamite"   // wild — unused for v1, reserved
  | "bandit";    // instant lose — unused for v1, reserved

export type Tier = "lose" | "small" | "medium" | "large" | "jackpot";

export type ScratchOutcome = {
  tier: Tier;
  /** Final coin payout (already includes the multiplier). */
  payout: number;
  /** Multiplier reveal square, 1 / 2 / 5 / 10. */
  multiplier: 1 | 2 | 5 | 10;
  /**
   * Row-major 3×3 of symbols. A win has at least one row, column, or
   * diagonal of three matching symbols; a loss never does, but always
   * has at least one line with exactly 2 of 3 matching (near-miss).
   */
  grid: ScratchSymbol[];
  /**
   * Index list (0..8) of cells that form the winning line, or null on
   * a loss. The client uses this to draw the lasso animation.
   */
  winLine: number[] | null;
  /**
   * Index list (0..8) of the cells that form the near-miss line on a
   * loss. The client gives those cells a soft glow when revealed.
   */
  nearMissLine: number[] | null;
};

// =============================================================
// Tunables
// =============================================================

/** Tier probabilities. Must sum to ~1.0; tiny rounding is fine. */
const TIER_WEIGHTS: { tier: Tier; weight: number }[] = [
  { tier: "lose",    weight: 0.750 },
  { tier: "small",   weight: 0.150 },
  { tier: "medium",  weight: 0.080 },
  { tier: "large",   weight: 0.019 },
  { tier: "jackpot", weight: 0.001 },
];

/** Per-tier base payout multiple of cost (before the multiplier square). */
const TIER_BASE_MULT: Record<Tier, [number, number]> = {
  lose:    [0, 0],
  small:   [1, 2],
  medium:  [5, 10],
  large:   [50, 50],
  jackpot: [1000, 1000],
};

/** Symbol weights for filling. */
const SYMBOL_WEIGHTS: { symbol: ScratchSymbol; weight: number }[] = [
  // Common ~ 50%
  { symbol: "horseshoe", weight: 17 },
  { symbol: "boot",      weight: 17 },
  { symbol: "ace",       weight: 16 },
  // Mid ~ 30%
  { symbol: "dice",      weight: 10 },
  { symbol: "revolver",  weight: 10 },
  { symbol: "whiskey",   weight: 10 },
  // Rare ~ 15%
  { symbol: "cactus",    weight: 7 },
  { symbol: "gold",      weight: 5 },
  { symbol: "sheriff",   weight: 3 },
];

/**
 * Each tier's winning symbol must come from a pool with payout high
 * enough to feel right. We pick the visible "winning symbol" from the
 * pool below per tier, but the actual cash payout is computed from
 * `cost * tierMultiple * multiplier` independent of which symbol shows.
 */
const TIER_WINNING_POOL: Record<Tier, ScratchSymbol[]> = {
  lose:    [],
  small:   ["horseshoe", "boot", "ace"],
  medium:  ["dice", "revolver", "whiskey"],
  large:   ["cactus", "gold"],
  jackpot: ["sheriff"],
};

const MULTIPLIER_VALUES: (1 | 2 | 5 | 10)[] = [1, 1, 1, 2, 2, 5, 10];

// =============================================================
// Public — generate a complete pre-determined ticket
// =============================================================

export function generateTicket(cost: number): ScratchOutcome {
  const tier = pickTier();

  if (tier === "lose") {
    const grid = fillLoseGrid();
    const nearMiss = findNearMissLine(grid);
    return {
      tier,
      payout: 0,
      multiplier: 1,
      grid,
      winLine: null,
      nearMissLine: nearMiss,
    };
  }

  const winSymbol = pick(TIER_WINNING_POOL[tier]);
  const [lo, hi] = TIER_BASE_MULT[tier];
  const baseMult = lo === hi ? lo : randInt(lo, hi);
  const multiplier = pick(MULTIPLIER_VALUES);

  // Jackpot/large always show their full advertised payout — the
  // multiplier square locks to 1× there so the prize matches the
  // reveal exactly.
  const lockedMult = (tier === "large" || tier === "jackpot") ? 1 : multiplier;

  const { grid, winLine } = fillWinGrid(winSymbol);

  return {
    tier,
    payout: Math.floor(cost * baseMult * lockedMult),
    multiplier: lockedMult,
    grid,
    winLine,
    nearMissLine: null,
  };
}

// =============================================================
// Internals
// =============================================================

function pickTier(): Tier {
  const r = Math.random();
  let acc = 0;
  for (const { tier, weight } of TIER_WEIGHTS) {
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

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
];

function pickLine(): number[] {
  return LINES[randInt(0, LINES.length - 1)];
}

function fillWinGrid(winSymbol: ScratchSymbol): { grid: ScratchSymbol[]; winLine: number[] } {
  const winLine = pickLine();
  const grid: ScratchSymbol[] = new Array(9);

  // Place winning symbol on the chosen line.
  for (const idx of winLine) grid[idx] = winSymbol;

  // Fill the rest, but make sure no OTHER full 3-line accidentally
  // matches a different symbol (otherwise the reveal would show two
  // wins).
  for (let i = 0; i < 9; i++) {
    if (grid[i] !== undefined) continue;
    grid[i] = drawNonConflictingSymbol(grid, i, winSymbol, winLine);
  }
  return { grid, winLine };
}

/**
 * Draw a symbol for cell `i` that doesn't accidentally complete a
 * non-winning 3-line. We never let any line reach 3-of-a-kind unless
 * it's the official winLine.
 */
function drawNonConflictingSymbol(
  grid: ScratchSymbol[],
  i: number,
  winSymbol: ScratchSymbol,
  winLine: number[],
): ScratchSymbol {
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = pickSymbol();
    if (wouldCreateConflictingLine(grid, i, s, winSymbol, winLine)) continue;
    return s;
  }
  // Fall back to *some* symbol that isn't the winSymbol.
  return winSymbol === "boot" ? "horseshoe" : "boot";
}

function wouldCreateConflictingLine(
  grid: ScratchSymbol[],
  i: number,
  s: ScratchSymbol,
  winSymbol: ScratchSymbol,
  winLine: number[],
): boolean {
  for (const line of LINES) {
    if (!line.includes(i)) continue;
    if (sameLine(line, winLine)) continue;
    // Count how many cells in this line, including the proposed s,
    // would equal s.
    let count = 0;
    let known = 0;
    for (const idx of line) {
      const cell = idx === i ? s : grid[idx];
      if (cell === undefined) continue;
      known++;
      if (cell === s) count++;
    }
    if (known === 3 && count === 3) return true;
    // Don't allow a non-win line to accidentally become 3-of winSymbol.
    if (s === winSymbol && known === 3 && count === 3) return true;
  }
  return false;
}

function sameLine(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Build a losing grid that contains NO 3-line, but at least one line
 * with exactly two matching cells (the near miss).
 */
function fillLoseGrid(): ScratchSymbol[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    const grid = naiveFill();
    if (hasAnyThreeLine(grid)) continue;
    if (!hasNearMissLine(grid)) {
      // Force a near-miss by mutating one cell on a random line.
      const line = pickLine();
      const sym = grid[line[0]];
      grid[line[1]] = sym;
      // Make sure this didn't accidentally create a 3-line.
      if (hasAnyThreeLine(grid)) continue;
    }
    if (!hasAnyThreeLine(grid) && hasNearMissLine(grid)) return grid;
  }
  // Deterministic fallback: 0,0,X / 1,1,Y / 2,2,Z near-miss layout.
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
