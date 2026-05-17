import type { AchievementCatalogEntry } from "./types";

export const COINFLIP_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_flip",  label: "Heads or Tails", description: "Flip your first coin.",                       icon: "🪙", rarity: "common"    },
  { id: "first_win",   label: "Called It",      description: "Win a coin flip.",                            icon: "✅", rarity: "common"    },
  { id: "called_heads", label: "Heads Up",      description: "Win calling heads.",                          icon: "👤", rarity: "common"    },
  { id: "called_tails", label: "Tail End",      description: "Win calling tails.",                          icon: "🐍", rarity: "common"    },
  { id: "big_flip",    label: "Brass Balls",    description: "Win a flip with a stake of 1 mil or more.",   icon: "🥃", rarity: "rare"      },
];
