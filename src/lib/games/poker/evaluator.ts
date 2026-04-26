// 7-card best-5 hand evaluator. Returns a comparable rank tuple where
// higher = better. Ties tested element-by-element.

import type { Card, Rank } from "@/lib/games/cards";

const RANK_VALUE: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  J: 11, Q: 12, K: 13, A: 14,
};

export type HandCategory =
  | "high_card"
  | "pair"
  | "two_pair"
  | "trips"
  | "straight"
  | "flush"
  | "full_house"
  | "quads"
  | "straight_flush";

const CATEGORY_RANK: Record<HandCategory, number> = {
  high_card: 0, pair: 1, two_pair: 2, trips: 3, straight: 4,
  flush: 5, full_house: 6, quads: 7, straight_flush: 8,
};

export type HandScore = {
  category: HandCategory;
  ranks: number[];     // tiebreakers, high-to-low
  scoreKey: number[];  // [categoryRank, ...ranks] for lexicographic compare
  best5: Card[];
};

const CATEGORY_LABEL: Record<HandCategory, string> = {
  high_card: "High Card",
  pair: "Pair",
  two_pair: "Two Pair",
  trips: "Three of a Kind",
  straight: "Straight",
  flush: "Flush",
  full_house: "Full House",
  quads: "Four of a Kind",
  straight_flush: "Straight Flush",
};

export function categoryLabel(c: HandCategory): string {
  return CATEGORY_LABEL[c];
}

function fiveCardScore(cards: Card[]): HandScore {
  // cards: exactly 5
  const vals = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  // Frequency of each rank
  const freq = new Map<number, number>();
  for (const v of vals) freq.set(v, (freq.get(v) ?? 0) + 1);
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const isFlush = suits.every((s) => s === suits[0]);

  // Straight detection (incl A-low: A,2,3,4,5)
  let straightHigh = 0;
  const distinct = [...new Set(vals)].sort((a, b) => b - a);
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) {
      straightHigh = distinct[0];
    } else if (
      distinct[0] === 14 && distinct[1] === 5 && distinct[2] === 4 &&
      distinct[3] === 3 && distinct[4] === 2
    ) {
      straightHigh = 5; // wheel
    }
  }

  if (isFlush && straightHigh > 0) {
    return mk("straight_flush", [straightHigh], cards);
  }
  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1][0];
    return mk("quads", [quad, kicker], cards);
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return mk("full_house", [groups[0][0], groups[1][0]], cards);
  }
  if (isFlush) {
    return mk("flush", vals, cards);
  }
  if (straightHigh > 0) {
    return mk("straight", [straightHigh], cards);
  }
  if (groups[0][1] === 3) {
    const trip = groups[0][0];
    const kickers = vals.filter((v) => v !== trip);
    return mk("trips", [trip, ...kickers], cards);
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const high = Math.max(groups[0][0], groups[1][0]);
    const low = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    return mk("two_pair", [high, low, kicker], cards);
  }
  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = vals.filter((v) => v !== pair);
    return mk("pair", [pair, ...kickers], cards);
  }
  return mk("high_card", vals, cards);
}

function mk(category: HandCategory, ranks: number[], best5: Card[]): HandScore {
  return { category, ranks, scoreKey: [CATEGORY_RANK[category], ...ranks], best5 };
}

// Best 5-card hand from 7 cards. Enumerates 21 combinations.
export function evaluate7(cards: Card[]): HandScore {
  if (cards.length < 5) {
    // Less than 5 — score what we have padded.
    return fiveCardScore(cards.slice(0, 5));
  }
  let best: HandScore | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const score = fiveCardScore([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(score.scoreKey, best.scoreKey) > 0) {
              best = score;
            }
          }
  return best!;
}

export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
