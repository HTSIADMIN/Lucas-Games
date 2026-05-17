import type { AchievementCatalogEntry } from "./types";

export const SCRATCH_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_ticket", label: "Lucky Coin",     description: "Scratch your first ticket.",                icon: "🎫", rarity: "common"    },
  { id: "first_win",    label: "Three of a Kind", description: "Match three symbols on a scratch ticket.", icon: "✨", rarity: "common"    },
  { id: "big_win",      label: "Foil Reveal",    description: "Win a high-tier scratch payout.",          icon: "🪙", rarity: "rare"      },
  { id: "jackpot",      label: "Bullion",        description: "Hit the top-tier scratch jackpot.",        icon: "🥇", rarity: "legendary" },
];
