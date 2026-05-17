import type { AchievementCatalogEntry } from "./types";

export const DICE_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_roll",  label: "Bones on the Felt", description: "Roll the dice for the first time.",       icon: "🎲", rarity: "common"    },
  { id: "first_win",   label: "Lucky Number",      description: "Win a dice roll.",                        icon: "✅", rarity: "common"    },
  { id: "narrow_win",  label: "By a Hair",         description: "Win with a target of 95 or higher.",      icon: "✂️", rarity: "epic"      },
  { id: "wide_win",    label: "Sure Thing",        description: "Win with a target of 10 or lower.",       icon: "🛡️", rarity: "common"    },
  { id: "big_dice",    label: "Bet the House",     description: "Win a dice roll for 1 mil or more.",      icon: "💰", rarity: "rare"      },
];
