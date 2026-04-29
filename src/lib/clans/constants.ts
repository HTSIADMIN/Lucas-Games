// Shared constants between server + client for clan UI.

import type { ClanAnimal, ClanChestTier } from "@/lib/db";

export const CLAN_FOUNDING_FEE = 25_000;
export const CLAN_MAX_MEMBERS = 8;

// Legacy animal set is kept around for any clans created before v3,
// so old icons still resolve. New clans pick from CLAN_EMBLEMS.
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

/** New themed emblems for v3+ clans. Each maps to a designed SVG in
 *  public/clan-icons/ via CLAN_EMBLEM_FILE below. */
export const CLAN_EMBLEMS: { key: ClanAnimal; name: string; tagline: string }[] = [
  { key: "aces_eights",         name: "Aces & Eights",      tagline: "The dead man's hand." },
  { key: "blood_moon_riders",   name: "Blood Moon Riders",  tagline: "Run with the wolves." },
  { key: "dead_mans_hand",      name: "Dead Man's Hand",    tagline: "Last cards on the table." },
  { key: "golden_compass",      name: "Golden Compass",     tagline: "True north pays." },
  { key: "iron_horseshoe",      name: "Iron Horseshoe",     tagline: "Forged-in luck." },
  { key: "phantom_posse",       name: "Phantom Posse",      tagline: "Riders unseen." },
  { key: "prospectors_guild",   name: "Prospectors' Guild", tagline: "Strike it rich." },
  { key: "rattlesnake_gang",    name: "Rattlesnake Gang",   tagline: "Strike first." },
  { key: "saguaro_brotherhood", name: "Saguaro Brotherhood",tagline: "Standing tall in the dust." },
  { key: "sheriffs_badge",      name: "Sheriff's Badge",    tagline: "Law of the land." },
  { key: "thunderhoof_cavalry", name: "Thunderhoof Cavalry",tagline: "Charge at dawn." },
  { key: "train_barons",        name: "Train Barons",       tagline: "Own the rails." },
];

/** Map a clan icon id to its SVG path. Legacy animal ids fall back
 *  to the old pixel-grid avatars baked into GameIcon. */
export const CLAN_EMBLEM_FILE: Partial<Record<ClanAnimal, string>> = {
  aces_eights:         "/clan-icons/clan-aces-eights.svg",
  blood_moon_riders:   "/clan-icons/clan-blood-moon-riders.svg",
  dead_mans_hand:      "/clan-icons/clan-dead-mans-hand.svg",
  golden_compass:      "/clan-icons/clan-golden-compass.svg",
  iron_horseshoe:      "/clan-icons/clan-iron-horseshoe.svg",
  phantom_posse:       "/clan-icons/clan-phantom-posse.svg",
  prospectors_guild:   "/clan-icons/clan-prospectors-guild.svg",
  rattlesnake_gang:    "/clan-icons/clan-rattlesnake-gang.svg",
  saguaro_brotherhood: "/clan-icons/clan-saguaro-brotherhood.svg",
  sheriffs_badge:      "/clan-icons/clan-sheriffs-badge.svg",
  thunderhoof_cavalry: "/clan-icons/clan-thunderhoof-cavalry.svg",
  train_barons:        "/clan-icons/clan-train-barons.svg",
};

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
