// Server-only: roll a chest's contents based on tier.

import { randInt, randomInt } from "@/lib/games/rng";
import { PROPERTIES } from "@/lib/games/monopoly/board";
import type { ClanChestRewards, ClanChestTier } from "@/lib/db";

// Property tier weights — lower-tier properties drop more often.
const TIER_WEIGHTS: Record<number, number> = { 1: 50, 2: 28, 3: 14, 4: 6, 5: 2 };

function pickProperty(): string {
  const weighted = PROPERTIES.flatMap((p) =>
    Array.from({ length: TIER_WEIGHTS[p.tier] ?? 1 }, () => p.id)
  );
  return weighted[randomInt(0, weighted.length)];
}

export function rollChestRewards(tier: ClanChestTier): ClanChestRewards {
  if (tier === "legendary") {
    const cards: Record<string, number> = {};
    for (let i = 0; i < 3; i++) {
      const id = pickProperty();
      cards[id] = (cards[id] ?? 0) + 1;
    }
    return {
      coins: 200_000 + randInt(0, 50_000),
      monopolyCards: Object.entries(cards).map(([propertyId, count]) => ({ propertyId, count })),
      spinTokens: 1,
    };
  }
  if (tier === "epic") {
    const cards: Record<string, number> = {};
    for (let i = 0; i < 2; i++) {
      const id = pickProperty();
      cards[id] = (cards[id] ?? 0) + 1;
    }
    const r: ClanChestRewards = {
      coins: 75_000 + randInt(0, 25_000),
      monopolyCards: Object.entries(cards).map(([propertyId, count]) => ({ propertyId, count })),
    };
    if (randInt(0, 99) < 30) r.spinTokens = 1;
    return r;
  }
  // rare
  const id = pickProperty();
  return {
    coins: 25_000 + randInt(0, 15_000),
    monopolyCards: [{ propertyId: id, count: 1 }],
  };
}
