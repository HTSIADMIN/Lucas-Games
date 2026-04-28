// Pack tiers — cosmetic loot boxes. Higher price = better odds for
// rarer items. Single source of truth for everything pack-shaped:
// pricing, weights, visual identity. Both the buy endpoint and the
// shop client read from here.

import type { Rarity } from "./catalog";

export type PackTier = "dust" | "brass" | "silver" | "vault";

export type PackTierSpec = {
  id: PackTier;
  name: string;
  blurb: string;
  price: number;
  /** Number of items rolled per pack. */
  size: number;
  /** Weighted distribution per rarity. Must sum to >0. */
  weights: Record<Rarity, number>;
  /** Visual identity. */
  primary: string;
  secondary: string;
  border: string;
  glow?: string;
  /** Glyph rendered on the pack box. */
  glyph: string;
  /** When set, the pack-tier card itself runs a CSS animation. */
  animated?: "vault";
};

export const PACK_TIERS: Record<PackTier, PackTierSpec> = {
  dust: {
    id: "dust",
    name: "Dust Pouch",
    blurb: "Cheapest tier. Mostly commons; legendaries are vanishingly rare.",
    price: 10_000,
    size: 5,
    weights: { common: 65, rare: 25, epic: 8,  legendary: 2,  mythic: 0 },
    primary:   "var(--saddle-300)",
    secondary: "var(--saddle-500)",
    border:    "var(--ink-900)",
    glyph:     "•",
  },
  brass: {
    id: "brass",
    name: "Brass Box",
    blurb: "Better odds. Epic shows up often, legendary in 1 of ~10 packs.",
    price: 100_000,
    size: 5,
    weights: { common: 35, rare: 35, epic: 20, legendary: 9,  mythic: 1 },
    primary:   "var(--gold-500)",
    secondary: "var(--gold-700)",
    border:    "var(--ink-900)",
    glow:      "var(--glow-gold)",
    glyph:     "⚙",
  },
  silver: {
    id: "silver",
    name: "Silver Crate",
    blurb: "Premium pull. Legendary in roughly 1 of 4 packs; mythic possible.",
    price: 1_000_000,
    size: 5,
    weights: { common: 10, rare: 25, epic: 35, legendary: 27, mythic: 3 },
    primary:   "#c9c9c9",
    secondary: "#7d7d7d",
    border:    "var(--ink-900)",
    glow:      "var(--glow-sky)",
    glyph:     "✦",
  },
  vault: {
    id: "vault",
    name: "Mythic Vault",
    blurb: "The whole vault. Six in ten rolls legendary; one in ten mythic.",
    price: 10_000_000,
    size: 5,
    weights: { common: 0,  rare: 5,  epic: 25, legendary: 60, mythic: 10 },
    primary:   "var(--neon-gold)",
    secondary: "var(--crimson-300)",
    border:    "var(--ink-900)",
    glow:      "var(--glow-gold)",
    glyph:     "✷",
    animated:  "vault",
  },
};

export const PACK_TIER_ORDER: PackTier[] = ["dust", "brass", "silver", "vault"];

export function isValidPackTier(t: unknown): t is PackTier {
  return typeof t === "string" && t in PACK_TIERS;
}
