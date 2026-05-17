import type { AchievementCatalogEntry } from "./types";

export const COINFLIP_DUEL_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_challenge", label: "Throwdown",     description: "Open your first coin-flip duel.",         icon: "🥊", rarity: "common"    },
  { id: "first_accept",    label: "Stepped Up",    description: "Accept an open coin-flip duel.",          icon: "🤝", rarity: "common"    },
  { id: "first_win",       label: "Bested 'Em",    description: "Win a coin-flip duel.",                   icon: "🏅", rarity: "common"    },
  { id: "big_duel_win",    label: "High Roller",   description: "Win a duel for a stake of 1 mil or more.", icon: "💰", rarity: "rare"      },
];
