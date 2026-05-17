// Unified achievement registry — presentation metadata for every
// unlock that can show up in the profile-modal trophy showcase.
//
// Per-game catalogs (e.g. ACHIEVEMENTS in src/lib/games/penny-pinchers/
// catalog.ts) own the unlock RULES + REWARDS; this registry owns the
// LABEL / ICON / RARITY for display. Decoupling lets game logic stay
// in one place while the showcase doesn't need to import N catalog
// files.
//
// Adding a new game's achievements:
//   1. Create the per-game catalog as usual.
//   2. Append rows here with the matching `source`/`id` pair.
//   3. Append a UNION ALL line in supabase/migrations/0045_*.sql
//      (or a future migration) for the per-game table.
//   4. Done — the showcase auto-renders the new ones.

import { ACHIEVEMENTS as PP_ACHIEVEMENTS } from "@/lib/games/penny-pinchers/catalog";
import { SLOTS_ACHIEVEMENTS } from "./catalogs/slots";
import { BLACKJACK_ACHIEVEMENTS } from "./catalogs/blackjack";
import { BLACKJACK_MP_ACHIEVEMENTS } from "./catalogs/blackjack_mp";
import { COINFLIP_ACHIEVEMENTS } from "./catalogs/coinflip";
import { COINFLIP_DUEL_ACHIEVEMENTS } from "./catalogs/coinflip_duel";
import { CRASH_ACHIEVEMENTS } from "./catalogs/crash";
import { DICE_ACHIEVEMENTS } from "./catalogs/dice";
import { MINES_ACHIEVEMENTS } from "./catalogs/mines";
import { PLINKO_ACHIEVEMENTS } from "./catalogs/plinko";
import { POKER_ACHIEVEMENTS } from "./catalogs/poker";
import { ROULETTE_ACHIEVEMENTS } from "./catalogs/roulette";
import { SCRATCH_ACHIEVEMENTS } from "./catalogs/scratch";
import { META_ACHIEVEMENTS } from "./catalogs/meta";
import type { AchievementCatalogEntry } from "./catalogs/types";

export type AchievementDef = {
  source: string; // e.g. "penny_pinchers"
  id: string;     // achievement_id within source
  label: string;
  description: string;
  /** Emoji or display glyph. Could be replaced with a GameIcon name
   *  in the future; for now an emoji keeps the showcase font-only. */
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
};

// Per-PP-achievement icon + rarity. The catalog ships the label +
// description; rarity is a presentation choice mapped from the
// catalog's reward size (1-2★ → common, 3-5 → rare, 6-9 → epic,
// 10+ → legendary).
const PP_ICONS: Record<string, { icon: string; rarity: AchievementDef["rarity"] }> = {
  a_penny_saved:         { icon: "🪙", rarity: "common" },
  sidewalk_scholar:      { icon: "👀", rarity: "common" },
  coin_connoisseur:      { icon: "🧐", rarity: "rare" },
  basically_mining:      { icon: "⛏️", rarity: "rare" },
  coin_crusader:         { icon: "🏆", rarity: "legendary" },
  goblin_mode:           { icon: "👹", rarity: "common" },
  pile_it_up:            { icon: "📚", rarity: "common" },
  bank_tellers_nightmare:{ icon: "💼", rarity: "rare" },
  bigger_boat:           { icon: "🚤", rarity: "rare" },
  frequent_flyer:        { icon: "✈️", rarity: "legendary" },
  empire_builder:        { icon: "🏰", rarity: "legendary" },
  first_million:         { icon: "💰", rarity: "rare" },
  made_of_money:         { icon: "💵", rarity: "legendary" },
  treasure_hunter:       { icon: "🗝️", rarity: "common" },
  relic_hoarder:         { icon: "🗿", rarity: "epic" },
  page_turner:           { icon: "📖", rarity: "common" },
  album_curator:         { icon: "📔", rarity: "legendary" },
  full_house:            { icon: "🎲", rarity: "epic" },
  frugal_saver:          { icon: "🪶", rarity: "common" },
  saint:                 { icon: "😇", rarity: "rare" },
  patron_saint:          { icon: "⛪", rarity: "legendary" },
};

function deriveRarityFromReward(reward: number): AchievementDef["rarity"] {
  if (reward >= 10) return "legendary";
  if (reward >= 6) return "epic";
  if (reward >= 3) return "rare";
  return "common";
}

const PP_REGISTRY: AchievementDef[] = PP_ACHIEVEMENTS.map((a) => {
  const presentation = PP_ICONS[a.id] ?? {
    icon: "🏅",
    rarity: deriveRarityFromReward(a.reward),
  };
  return {
    source: "penny_pinchers",
    id: a.id,
    label: a.label,
    description: a.description,
    icon: presentation.icon,
    rarity: presentation.rarity,
  } satisfies AchievementDef;
});

/** Helper — wrap a per-game catalog into the unified
 *  AchievementDef[] with the correct `source` tag. */
function withSource(
  source: string,
  entries: readonly AchievementCatalogEntry[],
): AchievementDef[] {
  return entries.map((e) => ({
    source,
    id: e.id,
    label: e.label,
    description: e.description,
    icon: e.icon,
    rarity: e.rarity,
  }));
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...PP_REGISTRY,
  ...withSource("slots",         SLOTS_ACHIEVEMENTS),
  ...withSource("blackjack",     BLACKJACK_ACHIEVEMENTS),
  ...withSource("blackjack-mp",  BLACKJACK_MP_ACHIEVEMENTS),
  ...withSource("coinflip",      COINFLIP_ACHIEVEMENTS),
  ...withSource("coinflip-duel", COINFLIP_DUEL_ACHIEVEMENTS),
  ...withSource("crash",         CRASH_ACHIEVEMENTS),
  ...withSource("dice",          DICE_ACHIEVEMENTS),
  ...withSource("mines",         MINES_ACHIEVEMENTS),
  ...withSource("plinko",        PLINKO_ACHIEVEMENTS),
  ...withSource("poker",         POKER_ACHIEVEMENTS),
  ...withSource("roulette",      ROULETTE_ACHIEVEMENTS),
  ...withSource("scratch",       SCRATCH_ACHIEVEMENTS),
  ...withSource("meta",          META_ACHIEVEMENTS),
];

export const ACHIEVEMENTS_BY_KEY: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [`${a.source}:${a.id}`, a]),
);

/** Look up an achievement by source/id pair. Returns a fallback
 *  unknown-achievement shape if missing, so a stale unlock row
 *  doesn't crash the UI. */
export function getAchievementDef(source: string, id: string): AchievementDef {
  return (
    ACHIEVEMENTS_BY_KEY[`${source}:${id}`] ?? {
      source,
      id,
      label: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: "",
      icon: "🏅",
      rarity: "common",
    }
  );
}

export function rarityColor(rarity: AchievementDef["rarity"]): string {
  switch (rarity) {
    case "common":    return "var(--ink-900)";
    case "rare":      return "var(--sky-500)";
    case "epic":      return "#a855f7";
    case "legendary": return "var(--gold-500)";
  }
}
