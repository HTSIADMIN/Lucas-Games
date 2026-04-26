// Static cosmetic catalog. Mirrors `cosmetic_items` table.
//
// Equip slots are independent — a player can stack:
//   avatar_color  + frame  + hat  + card_deck + theme
// at the same time.

export type CosmeticKind = "avatar_color" | "frame" | "card_deck" | "theme" | "hat";

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
  // ============ AVATAR COLORS — solids ============
  { id: "avatar_crimson",  kind: "avatar_color", name: "Crimson",       description: "Saloon red.",                 price:  25_000, meta: { color: "var(--crimson-300)" } },
  { id: "avatar_cactus",   kind: "avatar_color", name: "Cactus",        description: "Desert sage.",                price:  25_000, meta: { color: "var(--cactus-300)" } },
  { id: "avatar_sky",      kind: "avatar_color", name: "Big Sky",       description: "River blue.",                 price:  25_000, meta: { color: "var(--sky-300)" } },
  { id: "avatar_walnut",   kind: "avatar_color", name: "Walnut",        description: "Old-wood brown.",             price:  50_000, meta: { color: "var(--saddle-400)" } },
  { id: "avatar_sunset",   kind: "avatar_color", name: "Sunset",        description: "Late-day orange.",            price:  50_000, meta: { color: "#e87a3a" } },
  { id: "avatar_frost",    kind: "avatar_color", name: "Frost",         description: "Cool morning blue.",          price:  50_000, meta: { color: "#9fd5e8" } },
  { id: "avatar_buckskin", kind: "avatar_color", name: "Buckskin",      description: "Warm tan.",                   price:  75_000, meta: { color: "#d2a874" } },
  { id: "avatar_stone",    kind: "avatar_color", name: "Stone",         description: "Quiet gray.",                 price:  75_000, meta: { color: "#8a8077" } },
  { id: "avatar_lantern",  kind: "avatar_color", name: "Lantern",       description: "Glowing gold leaf.",          price: 150_000, meta: { color: "var(--neon-gold)" } },
  { id: "avatar_plum",     kind: "avatar_color", name: "Midnight Plum", description: "Deep evening purple.",        price: 200_000, meta: { color: "#5a3a78" } },
  { id: "avatar_ember",    kind: "avatar_color", name: "Ember",         description: "Smoldering coal red.",        price: 350_000, meta: { color: "#c93a2c" } },
  { id: "avatar_pearl",    kind: "avatar_color", name: "Pearl",         description: "Untarnished white.",          price: 750_000, meta: { color: "#f4ecdc" } },

  // ============ AVATAR COLORS — gradients ============
  { id: "avatar_grad_sunset",   kind: "avatar_color", name: "Sunset Sky",     description: "Gold to crimson.",      price: 200_000, meta: { color: "linear-gradient(135deg, #f5c842, #e05a3c)" } },
  { id: "avatar_grad_dusk",     kind: "avatar_color", name: "Dusk Trail",     description: "Plum into rose.",       price: 250_000, meta: { color: "linear-gradient(135deg, #5a3a78, #ff5544)" } },
  { id: "avatar_grad_river",    kind: "avatar_color", name: "Big River",      description: "Sky blue to cactus.",   price: 250_000, meta: { color: "linear-gradient(135deg, #5fa8d3, #6ba84f)" } },
  { id: "avatar_grad_canyon",   kind: "avatar_color", name: "Canyon",         description: "Saddle and gold.",      price: 300_000, meta: { color: "linear-gradient(135deg, #6b3f24, #f5c842)" } },
  { id: "avatar_grad_aurora",   kind: "avatar_color", name: "Aurora",         description: "Cyan to magenta.",      price: 500_000, meta: { color: "linear-gradient(135deg, #5fdcff, #ff2bd6)" } },
  { id: "avatar_grad_inferno",  kind: "avatar_color", name: "Inferno",        description: "Ember and gold flame.", price: 750_000, meta: { color: "linear-gradient(135deg, #c93a2c, #ffd84d)" } },
  { id: "avatar_grad_obsidian", kind: "avatar_color", name: "Obsidian",       description: "Black with gold leaf.", price:1_000_000, meta: { color: "linear-gradient(135deg, #1a0f08, #f5c842)" } },

  // ============ FRAMES ============
  { id: "frame_brass",    kind: "frame", name: "Brass Frame",   description: "Polished brass.",                  price:  75_000, meta: { color: "var(--gold-500)",   width: 6 } },
  { id: "frame_iron",     kind: "frame", name: "Iron Frame",    description: "Cold black iron.",                 price:  75_000, meta: { color: "var(--ink-900)",    width: 6 } },
  { id: "frame_copper",   kind: "frame", name: "Copper Frame",  description: "Warm copper sheen.",               price: 125_000, meta: { color: "#b97a45",            width: 6 } },
  { id: "frame_silver",   kind: "frame", name: "Silver Frame",  description: "Bright polish.",                   price: 175_000, meta: { color: "#c9c9c9",            width: 6 } },
  { id: "frame_sheriff",  kind: "frame", name: "Sheriff Star",  description: "Gold star on iron.",               price: 300_000, meta: { color: "var(--gold-300)",   width: 6, badge: "★" } },
  { id: "frame_ember",    kind: "frame", name: "Ember Frame",   description: "Glowing crimson outline.",         price: 400_000, meta: { color: "var(--neon-crimson)", width: 6, glow: true } },
  { id: "frame_frost",    kind: "frame", name: "Frost Frame",   description: "Glowing cyan outline.",            price: 400_000, meta: { color: "var(--neon-sky)",    width: 6, glow: true } },
  { id: "frame_diamond",  kind: "frame", name: "Diamond Frame", description: "Brilliant cut, prismatic.",        price:1_500_000, meta: { color: "#ffffff",          width: 8, glow: true, badge: "◆" } },

  // ============ HATS ============
  { id: "hat_stetson_brown", kind: "hat", name: "Brown Stetson",   description: "Trail-worn classic.",          price:  80_000,  meta: { hat: "stetson_brown" } },
  { id: "hat_stetson_black", kind: "hat", name: "Black Stetson",   description: "Gunslinger gold band.",        price: 150_000,  meta: { hat: "stetson_black" } },
  { id: "hat_sheriff",       kind: "hat", name: "Sheriff Hat",     description: "Gold star, brown felt.",       price: 350_000,  meta: { hat: "sheriff" } },
  { id: "hat_bandana_red",   kind: "hat", name: "Red Bandana",     description: "Polka dots, all attitude.",    price:  60_000,  meta: { hat: "bandana_red" } },
  { id: "hat_bandana_blue",  kind: "hat", name: "Blue Bandana",    description: "Cool calm.",                    price:  60_000,  meta: { hat: "bandana_blue" } },
  { id: "hat_sombrero",      kind: "hat", name: "Sombrero",        description: "Wide brim, bright band.",       price: 200_000,  meta: { hat: "sombrero" } },
  { id: "hat_tophat",        kind: "hat", name: "Top Hat",         description: "Saloon piano-man.",             price: 500_000,  meta: { hat: "tophat" } },
  { id: "hat_halo",          kind: "hat", name: "Halo",            description: "Heaven sent.",                   price:1_000_000, meta: { hat: "halo" } },

  // ============ CARD DECKS ============
  { id: "deck_classic",   kind: "card_deck", name: "Classic Deck", description: "Default suits.",                price:       0, meta: { palette: "classic" } },
  { id: "deck_outlaw",    kind: "card_deck", name: "Outlaw Deck",  description: "Crimson hearts, dust-gold diamonds.", price: 100_000, meta: { palette: "outlaw" } },
  { id: "deck_saloon",    kind: "card_deck", name: "Saloon Deck",  description: "Red and gold.",                  price: 200_000, meta: { palette: "saloon" } },
  { id: "deck_wanted",    kind: "card_deck", name: "Wanted Deck",  description: "Aged sepia.",                    price: 350_000, meta: { palette: "wanted" } },
  { id: "deck_sheriff",   kind: "card_deck", name: "Sheriff's Deck", description: "Blue and silver.",             price: 750_000, meta: { palette: "sheriff" } },

  // ============ THEMES ============
  { id: "theme_saloon",   kind: "theme", name: "Saloon (Default)", description: "Warm parchment and lantern gold.", price:        0, meta: { theme: "saloon", default: true } },
  { id: "theme_frontier", kind: "theme", name: "Frontier",         description: "High contrast. Faded sun.",        price:  250_000, meta: { theme: "frontier" } },
  { id: "theme_sunset",   kind: "theme", name: "Sunset Saloon",    description: "Burnt sienna and dusk.",           price:  350_000, meta: { theme: "sunset" } },
  { id: "theme_midnight", kind: "theme", name: "Midnight Tavern",  description: "Lights low, lanterns lit.",       price:  600_000, meta: { theme: "midnight" } },
];

export function findItem(id: string): CosmeticItem | undefined {
  return CATALOG.find((c) => c.id === id);
}

// Card-deck palette → suit colors.
export const DECK_PALETTES: Record<string, { spades: string; hearts: string; diamonds: string; clubs: string; back: string }> = {
  classic: {
    spades:   "var(--ink-900)",
    hearts:   "var(--crimson-500)",
    diamonds: "var(--sky-500)",
    clubs:    "var(--cactus-500)",
    back:     "var(--saddle-500)",
  },
  outlaw: {
    spades:   "#1a0f08",
    hearts:   "#ff2bd6",
    diamonds: "#c8941d",
    clubs:    "#3d6b2e",
    back:     "#4a1a1a",
  },
  saloon: {
    spades:   "#8b3a3a",
    hearts:   "#e05a3c",
    diamonds: "#f5c842",
    clubs:    "#7a5510",
    back:     "#5a1a1a",
  },
  wanted: {
    spades:   "#3d2418",
    hearts:   "#c93a2c",
    diamonds: "#a87545",
    clubs:    "#6b3f24",
    back:     "#a87545",
  },
  sheriff: {
    spades:   "#143348",
    hearts:   "#2c6a8e",
    diamonds: "#5fa8d3",
    clubs:    "#c9c9c9",
    back:     "#143348",
  },
};
