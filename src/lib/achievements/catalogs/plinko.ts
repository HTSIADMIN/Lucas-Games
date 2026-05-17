import type { AchievementCatalogEntry } from "./types";

export const PLINKO_ACHIEVEMENTS: readonly AchievementCatalogEntry[] = [
  { id: "first_drop",   label: "Pluck",          description: "Drop your first plinko ball.",              icon: "🟡", rarity: "common"    },
  { id: "first_win",    label: "On the Board",   description: "Land in a paying bucket.",                  icon: "🎯", rarity: "common"    },
  { id: "edge_bucket",  label: "Edge Lord",      description: "Land in an outermost (highest-pay) bucket.", icon: "🏆", rarity: "epic"      },
  { id: "ten_x_plinko", label: "10× Bounce",     description: "Win at least 10× your bet.",                icon: "🔟", rarity: "rare"      },
  { id: "high_risk",    label: "All-In Bouncer", description: "Drop a ball on high-risk.",                 icon: "⚠️", rarity: "common"    },
];
