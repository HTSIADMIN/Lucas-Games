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

export const CATALOG: CosmeticItem[] = [
  // Avatar colors (default = gold which everyone has)
  { id: "avatar_crimson", kind: "avatar_color", name: "Crimson",  description: "Saloon red.",          price: 25_000,  meta: { color: "var(--crimson-300)" } },
  { id: "avatar_cactus",  kind: "avatar_color", name: "Cactus",   description: "Desert sage.",         price: 25_000,  meta: { color: "var(--cactus-300)" } },
  { id: "avatar_sky",     kind: "avatar_color", name: "Big Sky",  description: "River blue.",          price: 25_000,  meta: { color: "var(--sky-300)" } },
  { id: "avatar_walnut",  kind: "avatar_color", name: "Walnut",   description: "Old-wood brown.",      price: 50_000,  meta: { color: "var(--saddle-400)" } },
  { id: "avatar_neon",    kind: "avatar_color", name: "Lantern",  description: "Glowing gold leaf.",   price: 100_000, meta: { color: "var(--neon-gold)" } },

  // Avatar frames (a thicker border with a flair)
  { id: "frame_brass",   kind: "frame", name: "Brass Frame",  description: "Polished brass border.",  price: 75_000,   meta: { color: "var(--gold-500)", width: 6 } },
  { id: "frame_iron",    kind: "frame", name: "Iron Frame",   description: "Cold black iron.",        price: 75_000,   meta: { color: "var(--ink-900)", width: 6 } },
  { id: "frame_sheriff", kind: "frame", name: "Sheriff Star", description: "Gold star on iron.",      price: 250_000,  meta: { color: "var(--gold-300)", width: 6, badge: "★" } },

  // Card decks (skin the playing cards — applied later when games support it)
  { id: "deck_classic", kind: "card_deck", name: "Classic Deck", description: "Default suits.",       price: 0,        meta: {} },
  { id: "deck_outlaw",  kind: "card_deck", name: "Outlaw Deck",  description: "Crimson hearts, dust-gold diamonds.", price: 100_000, meta: {} },
];

export function findItem(id: string): CosmeticItem | undefined {
  return CATALOG.find((c) => c.id === id);
}
