import type { AchievementCatalogEntry } from "./types";

export const CRASH_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_bet",      label: "Buckled In",       description: "Place your first bet on the Crash rocket.", icon: "🚀", rarity: "common"    },
  { id: "first_cashout",  label: "Safe Landing",     description: "Cash out before a crash.",                 icon: "💵", rarity: "common"    },
  { id: "ten_x",          label: "10× Cashout",      description: "Cash out at 10× or higher.",               icon: "🔟", rarity: "rare"      },
  { id: "hundred_x",      label: "Astronaut",        description: "Cash out at 100× or higher.",              icon: "👨‍🚀", rarity: "epic"      },
  { id: "thousand_x",     label: "Orbit Achieved",   description: "Cash out at 1000× or higher.",             icon: "🛸", rarity: "legendary" },
];
