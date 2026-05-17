import type { AchievementCatalogEntry } from "./types";

export const BLACKJACK_MP_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_seat",        label: "Pull Up A Chair",   description: "Take a seat at the multiplayer table.",        icon: "🪑", rarity: "common"    },
  { id: "first_win",         label: "Table Pride",       description: "Win a hand at the multiplayer table.",         icon: "🏆", rarity: "common"    },
  { id: "blackjack",         label: "Show It Off",       description: "Hit a natural blackjack with witnesses.",      icon: "🃏", rarity: "rare"      },
  { id: "five_card_charlie", label: "Hold The Table",    description: "Five-card win at the multiplayer table.",      icon: "🎴", rarity: "epic"      },
  { id: "dealer_busts",      label: "Saloon Style",      description: "Win because the dealer busted on the table.",  icon: "💥", rarity: "common"    },
];
