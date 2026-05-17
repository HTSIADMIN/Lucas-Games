import type { AchievementCatalogEntry } from "./types";

export const BLACKJACK_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_win",         label: "Hit Me",            description: "Win your first hand of blackjack.",              icon: "🃏", rarity: "common"    },
  { id: "blackjack",         label: "Natural",           description: "Get a 3:2 natural blackjack on the deal.",       icon: "🥃", rarity: "rare"      },
  { id: "five_card_charlie", label: "Five-Card Charlie", description: "Win with five cards without busting.",           icon: "🎴", rarity: "epic"      },
  { id: "doubled_win",       label: "Double or Nothing", description: "Double down and win the hand.",                  icon: "✖️", rarity: "rare"      },
  { id: "dealer_busts",      label: "House Folds",       description: "Win because the dealer busts.",                  icon: "💥", rarity: "common"    },
  { id: "perfect_21",        label: "Twenty-One",        description: "Land on exactly 21 with 3+ cards (no natural).", icon: "🎯", rarity: "rare"      },
];
