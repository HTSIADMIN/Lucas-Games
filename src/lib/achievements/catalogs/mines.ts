import type { AchievementCatalogEntry } from "./types";

export const MINES_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_dig",     label: "Pick & Shovel",   description: "Start your first Mines game.",                  icon: "⛏️", rarity: "common"    },
  { id: "first_cashout", label: "Pocketed It",     description: "Cash out before hitting a mine.",               icon: "💵", rarity: "common"    },
  { id: "big_clear",     label: "Lode Runner",     description: "Reveal 10 gems before cashing out.",            icon: "💎", rarity: "rare"      },
  { id: "near_clear",    label: "Pickaxe Master",  description: "Reveal all gems on the board.",                 icon: "👷", rarity: "legendary" },
  { id: "early_bust",    label: "Boom",            description: "Hit a mine on the very first click.",           icon: "💥", rarity: "common"    },
];
