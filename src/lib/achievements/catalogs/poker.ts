import type { AchievementCatalogEntry } from "./types";

export const POKER_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_seat",  label: "Take a Seat",      description: "Sit down at The Saloon poker table.",        icon: "🪑", rarity: "common"    },
  { id: "first_win",   label: "Best Hand",        description: "Win your first poker hand.",                 icon: "🃏", rarity: "common"    },
  { id: "all_in_win",  label: "All In, All Won",  description: "Win an all-in pot.",                         icon: "🔥", rarity: "rare"      },
  { id: "big_pot",     label: "Big Pot",          description: "Win a pot worth 1 mil or more.",             icon: "💰", rarity: "rare"      },
  { id: "bluff_win",   label: "Stone Cold Bluff", description: "Win by forcing everyone else to fold.",      icon: "🥷", rarity: "epic"      },
];
