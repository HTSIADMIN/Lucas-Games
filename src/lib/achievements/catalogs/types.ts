// Shared types for per-game achievement catalogs.

export type AchievementCatalogEntry = {
  /** Unique within a source. Used as the `achievement_id` column. */
  id: string;
  label: string;
  description: string;
  /** Emoji or short glyph rendered in the badge tile. */
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
};
