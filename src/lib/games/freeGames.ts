// Single source of truth for the four "earn" / free-game slugs.
//
// Used by:
//   - GameShell    — to decide whether to render the cross-game switcher
//                    button next to the back-to-Lobby link.
//   - FreeGamesButton — to populate the modal grid + decide which tiles
//                    show countdowns vs static FREE tags.
//   - /api/earn/status — only daily-spin + monopoly need readiness state.
//
// Adding a new free game? Add it here, give it a `hasTimer` value, and
// (if hasTimer) extend /api/earn/status so the modal can render its
// readiness.

import type { GameIconName } from "@/components/GameIcon";

export type FreeGameSlug = "daily-spin" | "monopoly" | "crossy-road" | "flappy" | "snake";

export type FreeGame = {
  slug: FreeGameSlug;
  name: string;
  tag: string;
  icon: GameIconName;
  /** True when /api/earn/status reports readiness for this slug. */
  hasTimer: boolean;
};

export const FREE_GAMES: readonly FreeGame[] = [
  { slug: "daily-spin",  name: "Daily Spin",        tag: "ONCE / DAY", icon: "lobby.daily_spin",  hasTimer: true  },
  { slug: "monopoly",    name: "Frontier Monopoly", tag: "EVERY HOUR", icon: "lobby.monopoly",    hasTimer: true  },
  { slug: "crossy-road", name: "Crossy Road",       tag: "FREE",       icon: "lobby.crossy_road", hasTimer: false },
  { slug: "flappy",      name: "Flappy",            tag: "FREE",       icon: "lobby.flappy",      hasTimer: false },
  { slug: "snake",       name: "Snake",             tag: "FREE",       icon: "lobby.snake",       hasTimer: false },
] as const;

export const FREE_GAME_SLUGS: ReadonlySet<string> = new Set(FREE_GAMES.map((g) => g.slug));

export function isFreeGame(slug: string): slug is FreeGameSlug {
  return FREE_GAME_SLUGS.has(slug);
}
