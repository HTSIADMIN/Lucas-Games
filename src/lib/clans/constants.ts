// Shared constants between server + client for clan UI.

import type { ClanAnimal, ClanChestTier } from "@/lib/db";

export const CLAN_FOUNDING_FEE = 25_000;
export const CLAN_MAX_MEMBERS = 8;

export const CLAN_ANIMALS: { key: ClanAnimal; name: string; tagline: string }[] = [
  { key: "wolf",   name: "Wolf",   tagline: "Pack hunter." },
  { key: "bear",   name: "Bear",   tagline: "Slow to anger." },
  { key: "eagle",  name: "Eagle",  tagline: "All-seeing." },
  { key: "snake",  name: "Snake",  tagline: "Fast strike." },
  { key: "bull",   name: "Bull",   tagline: "Brute force." },
  { key: "coyote", name: "Coyote", tagline: "Trickster." },
  { key: "hawk",   name: "Hawk",   tagline: "Sharp eye." },
  { key: "stag",   name: "Stag",   tagline: "Steady ruler." },
];

export const CHEST_TIER_LABEL: Record<ClanChestTier, string> = {
  rare: "Rare Chest",
  epic: "Epic Chest",
  legendary: "Legendary Chest",
};

export const CHEST_TIER_COLOR: Record<ClanChestTier, { bg: string; fg: string; ring: string; glow: string }> = {
  rare:      { bg: "#5fa8d3", fg: "#fef6e4", ring: "#143348", glow: "rgba(95,168,211,0.6)" },
  epic:      { bg: "#5a3a78", fg: "#fef6e4", ring: "#3a1f5e", glow: "rgba(140,90,200,0.6)" },
  legendary: { bg: "#f5c842", fg: "#1a0f08", ring: "#7a5510", glow: "rgba(255,216,77,0.85)" },
};

// Public source of truth for the chest preview UI. The actual roller in
// src/lib/clans/rewards.ts must mirror these numbers — keep them in sync.
export type ChestPreviewEntry = {
  tier: ClanChestTier;
  rankRange: string;
  coinsMin: number;
  coinsMax: number;
  cards: number;
  /** Probability of an extra bonus daily-spin token (0..1). */
  spinTokenChance: number;
  blurb: string;
};

export const CHEST_LOOT_PREVIEW: ChestPreviewEntry[] = [
  {
    tier: "legendary",
    rankRange: "Rank 1",
    coinsMin: 200_000,
    coinsMax: 250_000,
    cards: 3,
    spinTokenChance: 1,
    blurb: "The big one. Top of the standings every week.",
  },
  {
    tier: "epic",
    rankRange: "Ranks 2-3",
    coinsMin: 75_000,
    coinsMax: 100_000,
    cards: 2,
    spinTokenChance: 0.3,
    blurb: "Solid haul for keeping it close.",
  },
  {
    tier: "rare",
    rankRange: "Ranks 4-10",
    coinsMin: 25_000,
    coinsMax: 40_000,
    cards: 1,
    spinTokenChance: 0,
    blurb: "Showing up still pays.",
  },
];

// Drop weights for monopoly card tiers inside any chest. Mirrors
// TIER_WEIGHTS in src/lib/clans/rewards.ts. Exposed so the preview UI can
// hint at what cards are likely.
export const CARD_TIER_WEIGHTS: Record<number, number> = { 1: 50, 2: 28, 3: 14, 4: 6, 5: 2 };
export const CARD_TIER_LABEL: Record<number, string> = {
  1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary",
};
