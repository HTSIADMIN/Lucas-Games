import type { AchievementCatalogEntry } from "./types";

// Cross-game milestones. Source = "meta" in the database. Each
// achievement here is checked against the player's full game_sessions
// history at settlement time — see src/lib/achievements/detect/meta.ts.

export const META_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_bet",         label: "Welcome to the Saloon", description: "Place your first bet at any game.",              icon: "🤠", rarity: "common"    },
  { id: "hundred_bets",      label: "Regular",               description: "Place 100 bets across any games.",               icon: "🥃", rarity: "common"    },
  { id: "thousand_bets",     label: "Whale",                 description: "Place 1,000 bets across any games.",             icon: "🐋", rarity: "epic"      },
  { id: "ten_thousand_bets", label: "Lifer",                 description: "Place 10,000 bets across any games.",            icon: "♾️", rarity: "legendary" },
  { id: "played_every_game", label: "Sampled the Menu",      description: "Play at least one game at every casino table.",  icon: "🍽️", rarity: "epic"      },
  { id: "all_in_anywhere",   label: "Empty Pockets",         description: "Place a bet that drains your wallet to zero.",   icon: "💸", rarity: "rare"      },
];
