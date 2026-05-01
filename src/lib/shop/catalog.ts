// Static cosmetic catalog. Mirrors `cosmetic_items` table.
//
// Equip slots are independent — a player can stack:
//   avatar_color  + frame  + hat  + card_deck + theme
// at the same time.

export type CosmeticKind = "avatar_color" | "frame" | "card_deck" | "theme" | "hat" | "coin_face";

export type CosmeticItem = {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  price: number;
  meta: Record<string, unknown>;
};

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export function rarityOf(price: number): Rarity {
  if (price <= 0) return "common";
  if (price < 100_000)   return "rare";
  if (price < 500_000)   return "epic";
  if (price < 2_000_000) return "legendary";
  return "mythic";
}

export const RARITY_COLOR: Record<Rarity, { bg: string; fg: string; glow?: string }> = {
  common:    { bg: "var(--saddle-300)",  fg: "var(--ink-900)" },
  rare:      { bg: "var(--sky-300)",     fg: "var(--parchment-50)" },
  epic:      { bg: "var(--crimson-300)", fg: "var(--parchment-50)" },
  legendary: { bg: "var(--gold-300)",    fg: "var(--ink-900)", glow: "var(--glow-gold)" },
  // Mythic uses an animated rainbow background; see .rarity-mythic.
  mythic:    { bg: "var(--neon-gold)",   fg: "var(--ink-900)", glow: "var(--glow-gold)" },
};

/** Items the player owns automatically — never roll into a pack and
 *  always show as owned in the showcase. Default items have either
 *  meta.default: true or price === 0. */
export function isDefaultItem(item: CosmeticItem): boolean {
  return item.price <= 0 || (item.meta as { default?: boolean }).default === true;
}

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
  { id: "deck_classic",   kind: "card_deck", name: "Classic Deck", description: "Default suits.",                price:       0, meta: { palette: "classic", default: true } },
  { id: "deck_outlaw",    kind: "card_deck", name: "Outlaw Deck",  description: "Crimson hearts, dust-gold diamonds.", price: 100_000, meta: { palette: "outlaw" } },
  { id: "deck_saloon",    kind: "card_deck", name: "Saloon Deck",  description: "Red and gold.",                  price: 200_000, meta: { palette: "saloon" } },
  { id: "deck_wanted",    kind: "card_deck", name: "Wanted Deck",  description: "Aged sepia.",                    price: 350_000, meta: { palette: "wanted" } },
  { id: "deck_sheriff",   kind: "card_deck", name: "Sheriff's Deck", description: "Blue and silver.",             price: 750_000, meta: { palette: "sheriff" } },
  // Advanced legendary decks — palette-driven face + back overrides.
  { id: "deck_frostbite", kind: "card_deck", name: "Frostbite Deck", description: "Iced face, crystalline back, glacier-blue suits.", price: 1_500_000, meta: { palette: "frostbite" } },
  { id: "deck_bone",      kind: "card_deck", name: "Bone Cards",     description: "Bleached parchment with sun-ray relic back.",      price: 1_750_000, meta: { palette: "bone" } },
  // Mythic decks — animated backs, only the rarest packs roll them.
  { id: "deck_neonwire",  kind: "card_deck", name: "Neon Wire Deck", description: "Electric grid-back. Pulses with current.",         price: 2_500_000, meta: { palette: "neonwire", animated: "neon-wire" } },
  { id: "deck_embers",    kind: "card_deck", name: "Burning Embers", description: "Smouldering back with flickering ember glow.",     price: 3_500_000, meta: { palette: "embers", animated: "embers" } },
  { id: "deck_royalcourt",kind: "card_deck", name: "Royal Court",    description: "Holographic conic gradient — purple, gold, magenta. The crown jewel.", price: 6_000_000, meta: { palette: "royalcourt", animated: "royal-court" } },

  // ============ THEMES ============
  { id: "theme_saloon",   kind: "theme", name: "Saloon (Default)", description: "Warm parchment and lantern gold.",       price:        0, meta: { theme: "saloon", default: true } },
  { id: "theme_frontier", kind: "theme", name: "Frontier",         description: "Dusty tan and warm shade.",              price:  250_000, meta: { theme: "frontier" } },
  { id: "theme_sunset",   kind: "theme", name: "Sunset Saloon",    description: "Burnt sienna fading into purple dusk.",  price:  350_000, meta: { theme: "sunset" } },
  { id: "theme_midnight", kind: "theme", name: "Midnight Tavern",  description: "Lights low, lanterns lit.",              price:  600_000, meta: { theme: "midnight" } },
  // Five new themes — wider palette range, full dark + light coverage.
  { id: "theme_emerald",  kind: "theme", name: "Emerald Vault",    description: "Forest-green felt with brass trim.",       price:  450_000, meta: { theme: "emerald" } },
  { id: "theme_crimson",  kind: "theme", name: "Crimson Den",      description: "Smoky speakeasy. Black walls, blood panels.", price:  500_000, meta: { theme: "crimson" } },
  { id: "theme_royal",    kind: "theme", name: "Royal Velvet",     description: "Deep purple parlour with cream + gold.",   price:  900_000, meta: { theme: "royal" } },
  { id: "theme_ice",      kind: "theme", name: "Ice Saloon",       description: "Pale blue and silver. Frozen frontier.",   price: 1_200_000, meta: { theme: "ice" } },
  { id: "theme_highnoon", kind: "theme", name: "High Noon",        description: "Sun-bleached bone with deep ink contrast.",price: 1_500_000, meta: { theme: "highnoon" } },

  // ============ MYTHIC — animated, only available from the highest pack ============
  // The renderer detects meta.animated tokens and applies CSS keyframes.
  // See .lg-anim-* in globals.css.
  {
    id: "avatar_mythic_prismatic",
    kind: "avatar_color",
    name: "Prismatic",
    description: "Every colour of the spectrum, all at once.",
    price: 2_500_000,
    // Sentinel: when equipped, the stored avatar_color is the literal
    // "animated:prismatic" token. Avatar.tsx detects the prefix and
    // applies the matching CSS animation class instead of using it
    // as a background.
    meta: { color: "animated:prismatic", animated: "prismatic" },
  },
  {
    id: "frame_mythic_solar",
    kind: "frame",
    name: "Solar Frame",
    description: "Spinning corona of gold and crimson light.",
    price: 4_000_000,
    meta: { color: "var(--neon-gold)", width: 8, glow: true, badge: "☀", animated: "solar" },
  },
  {
    id: "hat_mythic_crown",
    kind: "hat",
    name: "Outlaw Crown",
    description: "Jewelled crown that pulses gold.",
    price: 5_000_000,
    meta: { hat: "crown", animated: "crown" },
  },
  {
    id: "frame_mythic_aether",
    kind: "frame",
    name: "Aether Frame",
    description: "Drifting rainbow shimmer. Looks alive.",
    price: 7_500_000,
    meta: { color: "#ff5544", width: 8, glow: true, animated: "aether" },
  },

  // ============ COIN FACES ============
  // Cosmetic coin designs that swap the default pixel coin in
  // Coin Flip + Coin Flip Duel. Each entry references a pair of
  // PNGs in /public/coin-faces/. The default "lucas-mark" pixel
  // coin is implicit (price 0, default = true) so newly-registered
  // players have something equipped.
  {
    id: "coin_default", kind: "coin_face", name: "Lucas Mark",
    description: "The original brass pixel coin.",
    price: 0, meta: { default: true, key: "default" },
  },
  {
    id: "coin_bounty", kind: "coin_face", name: "Bounty",
    description: "Wanted-poster gold; the price on someone's head.",
    price: 75_000, meta: {
      key: "bounty",
      front: "/coin-faces/coin-bounty-front.png",
      back: "/coin-faces/coin-bounty-back.png",
    },
  },
  {
    id: "coin_outlaw", kind: "coin_face", name: "Outlaw",
    description: "Smoke-blackened steel. Heads says trouble.",
    price: 150_000, meta: {
      key: "outlaw",
      front: "/coin-faces/coin-outlaw-front.png",
      back: "/coin-faces/coin-outlaw-back.png",
    },
  },
  {
    id: "coin_prospector", kind: "coin_face", name: "Prospector",
    description: "Hand-stamped from a fresh nugget.",
    price: 350_000, meta: {
      key: "prospector",
      front: "/coin-faces/coin-prospector-front.png",
      back: "/coin-faces/coin-prospector-back.png",
    },
  },
  {
    id: "coin_saloon", kind: "coin_face", name: "Saloon Token",
    description: "Buys a round and a hand of cards.",
    price: 500_000, meta: {
      key: "saloon",
      front: "/coin-faces/coin-saloon-front.png",
      back: "/coin-faces/coin-saloon-back.png",
    },
  },
  {
    id: "coin_sheriff", kind: "coin_face", name: "Sheriff's Star",
    description: "Five points of pure brass authority.",
    price: 1_500_000, meta: {
      key: "sheriff",
      front: "/coin-faces/coin-sheriff-front.png",
      back: "/coin-faces/coin-sheriff-back.png",
    },
  },
];

export function findItem(id: string): CosmeticItem | undefined {
  return CATALOG.find((c) => c.id === id);
}

// Card-deck palette → suit colors + optional face/back styling. The
// older decks only set the four suit colors and a back fill; the
// new advanced decks can additionally override:
//   face          — face-card background (defaults to parchment)
//   border        — card border colour (defaults to ink-900)
//   backImage     — CSS background-image for the face-down back
//                   (overrides the default 45° stripe)
//   animated      — CSS animation token; the renderer attaches the
//                   matching .lg-deck-anim-<token> class to the back
export type DeckPalette = {
  spades: string;
  hearts: string;
  diamonds: string;
  clubs: string;
  back: string;
  face?: string;
  border?: string;
  backImage?: string;
  animated?: string;
  /** When true, a face-up card draws its border in the same colour
   *  as its suit (rather than the deck's `border` / ink default).
   *  Used by the Neon Wire deck so each suit lights its own edge.
   *  Face-down cards still use the deck `border`. */
  borderMatchesSuit?: boolean;
};

export const DECK_PALETTES: Record<string, DeckPalette> = {
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

  // ============ ADVANCED / RARE ============
  // Frostbite — icy blues, frosted face; the back is an angular
  // crystal pattern in cyan.
  frostbite: {
    spades:   "#0d3a5a",
    hearts:   "#2c7da0",
    diamonds: "#5fb8d3",
    clubs:    "#8ed6e0",
    back:     "#0d3a5a",
    face:     "#e6f4f8",
    border:   "#0d3a5a",
    backImage:
      "linear-gradient(135deg, transparent 46%, rgba(255,255,255,0.55) 46% 54%, transparent 54%)," +
      "linear-gradient(45deg, transparent 46%, rgba(255,255,255,0.55) 46% 54%, transparent 54%)," +
      "linear-gradient(180deg, #1a4d72 0%, #0d3a5a 100%)",
  },

  // Bone — bleached white face with black ink suits and a skull-
  // motif back built from CSS conic-gradient sun-rays.
  bone: {
    spades:   "#0a0408",
    hearts:   "#7a0a0a",
    diamonds: "#3a2810",
    clubs:    "#0a0408",
    back:     "#1a0f08",
    face:     "#f4ecdc",
    border:   "#1a0f08",
    backImage:
      "radial-gradient(circle at 50% 30%, #d4c8a8 0 18%, transparent 19%)," +
      "conic-gradient(from 0deg at 50% 50%, #d4c8a8 0deg, transparent 8deg, transparent 22deg, #d4c8a8 22deg 30deg, transparent 30deg)," +
      "linear-gradient(180deg, #2a1810, #0a0408)",
  },

  // Neon Wire — electric magenta + cyan suits with a glowing,
  // animated grid back. Mythic. Face-up cards light their edge in
  // the suit colour (borderMatchesSuit) for the full neon-strip
  // look; the face-down back keeps the magenta-edge trim.
  neonwire: {
    spades:   "#ff2bd6",
    hearts:   "#ff66e8",
    diamonds: "#5fdcff",
    clubs:    "#2bffac",
    back:     "#0a0420",
    face:     "#0a0420",
    border:   "#ff2bd6",
    backImage:
      "linear-gradient(0deg, transparent 49%, rgba(255,43,214,0.6) 50%, transparent 51%)," +
      "linear-gradient(90deg, transparent 49%, rgba(95,220,255,0.5) 50%, transparent 51%)," +
      "linear-gradient(135deg, #1a0a3d, #0a0420)",
    animated: "neon-wire",
    borderMatchesSuit: true,
  },

  // Burning Embers — dark slate face with crimson suits and an
  // animated glowing ember-flicker back. Mythic.
  embers: {
    spades:   "#1a0a08",
    hearts:   "#ff4d2b",
    diamonds: "#ffb84d",
    clubs:    "#7a1a0a",
    back:     "#1a0a08",
    face:     "#2a1810",
    border:   "#7a1a0a",
    backImage:
      "radial-gradient(circle at 30% 40%, rgba(255, 100, 50, 0.85) 0%, transparent 30%)," +
      "radial-gradient(circle at 70% 60%, rgba(255, 200, 80, 0.65) 0%, transparent 25%)," +
      "radial-gradient(circle at 50% 80%, rgba(255, 60, 30, 0.5) 0%, transparent 35%)," +
      "linear-gradient(180deg, #3a1810, #0a0408)",
    animated: "embers",
  },

  // Royal Court — deep purple + gold with a holographic shifting
  // back. The peak mythic deck.
  royalcourt: {
    spades:   "#3d1a5e",
    hearts:   "#c83a8a",
    diamonds: "#ffd84d",
    clubs:    "#5a3a78",
    back:     "#3d1a5e",
    face:     "#fff7e6",
    border:   "#7a5510",
    backImage:
      "conic-gradient(from 0deg at 50% 50%, #ffd84d 0deg, #c83a8a 90deg, #5a3a78 180deg, #3d1a5e 270deg, #ffd84d 360deg)",
    animated: "royal-court",
  },
};
