import type { AchievementCatalogEntry } from "./types";

export const SLOTS_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_spin",      label: "First Spin",        description: "Spin the reels for the first time.",          icon: "🎰", rarity: "common"    },
  { id: "first_win",       label: "Pay Line",          description: "Land your first paying combination.",         icon: "💸", rarity: "common"    },
  { id: "bonus_triggered", label: "Boomtown",          description: "Trigger the hold-and-spin bonus round.",      icon: "🏗️", rarity: "rare"      },
  { id: "big_multi",       label: "100x Lucky",        description: "Win at least 100× your stake on one spin.",   icon: "💯", rarity: "epic"      },
  { id: "jackpot",         label: "Progressive Jackpot", description: "Hit the 1-in-5000 jackpot trigger.",        icon: "👑", rarity: "legendary" },
  { id: "meter_max",       label: "Whiskey Barrel",    description: "Fill the Whiskey Barrel meter to forced.",    icon: "🥃", rarity: "rare"      },
];
