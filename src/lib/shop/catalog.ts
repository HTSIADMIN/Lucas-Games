// Static cosmetic catalog. Mirrors `cosmetic_items` table — when Supabase lands,
// this can either move into the DB and be fetched, or stay in code as a seed.

export type CosmeticKind = "avatar_color" | "frame" | "card_deck" | "theme";

export type CosmeticItem = {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  price: number;
  meta: Record<string, unknown>;
};

export type Rarity = "common" | "rare" | "epic" | "legendary";

export function rarityOf(price: number): Rarity {
  if (price <= 0) return "common";
  if (price < 100_000) return "rare";
  if (price < 500_000) return "epic";
  return "legendary";
}

export const RARITY_COLOR: Record<Rarity, { bg: string; fg: string; glow?: string }> = {
  common:    { bg: "var(--saddle-300)",  fg: "var(--ink-900)" },
  rare:      { bg: "var(--sky-300)",     fg: "var(--parchment-50)" },
  epic:      { bg: "var(--crimson-300)", fg: "var(--parchment-50)" },
  legendary: { bg: "var(--gold-300)",    fg: "var(--ink-900)", glow: "var(--glow-gold)" },
};

export const CATALOG: CosmeticItem[] = [
  // ============ AVATAR COLORS ============
  { id: "avatar_crimson", kind: "avatar_color", name: "Crimson",       description: "Saloon red.",                price:  25_000, meta: { color: "var(--crimson-300)" } },
  { id: "avatar_cactus",  kind: "avatar_color", name: "Cactus",        description: "Desert sage.",               price:  25_000, meta: { color: "var(--cactus-300)" } },
  { id: "avatar_sky",     kind: "avatar_color", name: "Big Sky",       description: "River blue.",                price:  25_000, meta: { color: "var(--sky-300)" } },
  { id: "avatar_walnut",  kind: "avatar_color", name: "Walnut",        description: "Old-wood brown.",            price:  50_000, meta: { color: "var(--saddle-400)" } },
  { id: "avatar_sunset",  kind: "avatar_color", name: "Sunset",        description: "Late-day orange.",           price:  50_000, meta: { color: "#e87a3a" } },
  { id: "avatar_frost",   kind: "avatar_color", name: "Frost",         description: "Cool morning blue.",         price:  50_000, meta: { color: "#9fd5e8" } },
  { id: "avatar_buckskin",kind: "avatar_color", name: "Buckskin",      description: "Warm tan.",                  price:  75_000, meta: { color: "#d2a874" } },
  { id: "avatar_stone",   kind: "avatar_color", name: "Stone",         description: "Quiet gray.",                price:  75_000, meta: { color: "#8a8077" } },
  { id: "avatar_lantern", kind: "avatar_color", name: "Lantern",       description: "Glowing gold leaf.",         price: 150_000, meta: { color: "var(--neon-gold)" } },
  { id: "avatar_plum",    kind: "avatar_color", name: "Midnight Plum", description: "Deep evening purple.",       price: 200_000, meta: { color: "#5a3a78" } },
  { id: "avatar_ember",   kind: "avatar_color", name: "Ember",         description: "Smoldering coal red.",       price: 350_000, meta: { color: "#c93a2c" } },
  { id: "avatar_pearl",   kind: "avatar_color", name: "Pearl",         description: "Untarnished white.",         price: 750_000, meta: { color: "#f4ecdc" } },

  // ============ FRAMES (avatar borders) ============
  { id: "frame_brass",    kind: "frame", name: "Brass Frame",   description: "Polished brass.",                  price:  75_000, meta: { color: "var(--gold-500)",   width: 6 } },
  { id: "frame_iron",     kind: "frame", name: "Iron Frame",    description: "Cold black iron.",                 price:  75_000, meta: { color: "var(--ink-900)",    width: 6 } },
  { id: "frame_copper",   kind: "frame", name: "Copper Frame",  description: "Warm copper sheen.",               price: 125_000, meta: { color: "#b97a45",            width: 6 } },
  { id: "frame_silver",   kind: "frame", name: "Silver Frame",  description: "Bright polish.",                   price: 175_000, meta: { color: "#c9c9c9",            width: 6 } },
  { id: "frame_sheriff",  kind: "frame", name: "Sheriff Star",  description: "Gold star on iron.",               price: 300_000, meta: { color: "var(--gold-300)",   width: 6, badge: "★" } },
  { id: "frame_ember",    kind: "frame", name: "Ember Frame",   description: "Glowing crimson outline.",         price: 400_000, meta: { color: "var(--neon-crimson)", width: 6, glow: true } },
  { id: "frame_frost",    kind: "frame", name: "Frost Frame",   description: "Glowing cyan outline.",            price: 400_000, meta: { color: "var(--neon-sky)",    width: 6, glow: true } },
  { id: "frame_diamond",  kind: "frame", name: "Diamond Frame", description: "Brilliant cut, prismatic.",        price: 1_500_000, meta: { color: "#ffffff",          width: 8, glow: true, badge: "◆" } },

  // ============ CARD DECKS ============
  { id: "deck_classic",   kind: "card_deck", name: "Classic Deck", description: "Default suits.",                price:       0, meta: {} },
  { id: "deck_outlaw",    kind: "card_deck", name: "Outlaw Deck",  description: "Crimson hearts, dust-gold diamonds.", price: 100_000, meta: {} },
  { id: "deck_saloon",    kind: "card_deck", name: "Saloon Deck",  description: "Red and gold, pour the whiskey.", price: 200_000, meta: {} },
  { id: "deck_wanted",    kind: "card_deck", name: "Wanted Deck",  description: "Aged sepia. Smells like trouble.", price: 350_000, meta: {} },
  { id: "deck_sheriff",   kind: "card_deck", name: "Sheriff's Deck", description: "Blue and silver. Don't mess.",  price: 750_000, meta: {} },

  // ============ THEMES ============
  // Theme equipping is tracked but not yet wired into actual CSS swap.
  // Catalog entries reserve them so friends can buy now and have them
  // when the theme switcher ships.
  { id: "theme_saloon",   kind: "theme", name: "Saloon (Default)", description: "Warm parchment and lantern gold.", price:        0, meta: { default: true } },
  { id: "theme_frontier", kind: "theme", name: "Frontier",         description: "High contrast. Faded sun.",        price:  250_000, meta: {} },
  { id: "theme_sunset",   kind: "theme", name: "Sunset Saloon",    description: "Burnt sienna and dusk.",           price:  350_000, meta: {} },
  { id: "theme_midnight", kind: "theme", name: "Midnight Tavern",  description: "Lights low, lanterns lit.",       price:  600_000, meta: {} },
];

export function findItem(id: string): CosmeticItem | undefined {
  return CATALOG.find((c) => c.id === id);
}
