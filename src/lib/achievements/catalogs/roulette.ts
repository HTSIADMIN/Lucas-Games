import type { AchievementCatalogEntry } from "./types";

export const ROULETTE_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_spin",  label: "No More Bets",    description: "Spin the wheel for the first time.",        icon: "🎡", rarity: "common"    },
  { id: "first_win",   label: "The Wheel Smiles", description: "Win a roulette round.",                    icon: "🟢", rarity: "common"    },
  { id: "straight_up", label: "Straight Up",     description: "Win on a single-number straight bet.",      icon: "🎯", rarity: "rare"      },
  { id: "all_table",   label: "Cover the Felt",  description: "Place bets on 10+ different positions in one round.", icon: "🧮", rarity: "epic"      },
  { id: "hot_streak",  label: "Hot Number",      description: "Win two roulette rounds in a row.",         icon: "🔥", rarity: "rare"      },
];
