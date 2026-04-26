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
