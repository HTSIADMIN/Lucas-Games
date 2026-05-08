"use client";

import {
  UPGRADES,
  type PermUpgradeId,
  type UpgradeCategory,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import { effectiveUpgradeMaxLevel, nextUpgradeCost } from "@/lib/games/penny-pinchers/engine";

const CATEGORY_LABEL: Record<UpgradeCategory, string> = {
  click: "Click",
  value: "Value",
  spawn: "Spawn",
  automation: "Auto",
};
const CATEGORY_BG: Record<UpgradeCategory, string> = {
  click: "var(--cactus-300)",
  value: "var(--gold-300)",
  spawn: "var(--sky-300)",
  automation: "#5a4cc0",
};
const CATEGORY_FG: Record<UpgradeCategory, string> = {
  click: "var(--ink-900)",
  value: "var(--ink-900)",
  spawn: "var(--parchment-50)",
  automation: "var(--parchment-50)",
};

export function UpgradeShop({
  levels,
  cents,
  onBuy,
  perm,
}: {
  levels: Record<UpgradeId, number> | Partial<Record<UpgradeId, number>>;
  cents: number;
  onBuy: (id: UpgradeId, cost: number) => void;
  /** Higher Ceilings (perm) extends the per-upgrade max levels. */
  perm?: Partial<Record<PermUpgradeId, number>>;
}) {
  // Flat sort — categories are no longer top-level groupings; instead
  // every card carries a small category chip for kind-at-a-glance
  // and the whole list ranks by:
  //   1) maxed last
  //   2) affordable next
  //   3) catalog order otherwise
  // so the next thing the player can actually buy is always pinned
  // to the top of the scroll.
  const sorted = UPGRADES.slice().sort((a, b) => {
    const aLvl = levels[a.id] ?? 0;
    const bLvl = levels[b.id] ?? 0;
    const aMaxed = aLvl >= effectiveUpgradeMaxLevel(a, perm ?? {});
    const bMaxed = bLvl >= effectiveUpgradeMaxLevel(b, perm ?? {});
    if (aMaxed !== bMaxed) return aMaxed ? 1 : -1;
    if (aMaxed) return 0;
    const aCost = nextUpgradeCost(a.id, aLvl, perm ?? {});
    const bCost = nextUpgradeCost(b.id, bLvl, perm ?? {});
    const aAffordable = aCost != null && cents >= aCost;
    const bAffordable = bCost != null && cents >= bCost;
    if (aAffordable !== bAffordable) return aAffordable ? -1 : 1;
    return 0;
  });
  return (
    <div className="stack" style={{ gap: "var(--sp-2)", overflowY: "auto", maxHeight: 480 }}>
      <style>{`
        @keyframes pp-shop-affordable {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,196,64,0); }
          50%      { box-shadow: 0 0 0 2px rgba(255,196,64,0.45), 0 0 12px rgba(255,196,64,0.5); }
        }
      `}</style>
      {sorted.map((u) => {
        const lvl = levels[u.id] ?? 0;
        const maxLvl = effectiveUpgradeMaxLevel(u, perm ?? {});
        const maxed = lvl >= maxLvl;
        const cost = nextUpgradeCost(u.id, lvl, perm ?? {});
        const affordable = cost != null && cents >= cost;
        return (
          <button
            key={u.id}
            type="button"
            disabled={maxed || !affordable}
            onClick={() => cost != null && onBuy(u.id, cost)}
            style={{
              textAlign: "left",
              background: maxed
                ? "var(--saddle-200)"
                : affordable
                ? "var(--parchment-100)"
                : "var(--parchment-200)",
              border: `2px solid ${affordable ? "var(--gold-300)" : "var(--saddle-300)"}`,
              padding: "8px 10px",
              cursor: maxed || !affordable ? "default" : "pointer",
              color: "var(--ink-900)",
              opacity: maxed ? 0.55 : 1,
              animation: affordable
                ? "pp-shop-affordable 1.6s ease-in-out infinite"
                : undefined,
              transition: "background 200ms, transform 120ms",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 9,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: CATEGORY_BG[u.category],
                    color: CATEGORY_FG[u.category],
                    border: "1px solid var(--ink-900)",
                    padding: "1px 5px",
                  }}
                >
                  {CATEGORY_LABEL[u.category]}
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--ink-900)" }}>
                  {u.label}
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--saddle-400)" }}>
                Lv {lvl}/{maxLvl}
              </span>
            </div>
            <div className="text-mute" style={{ fontSize: 11, marginBottom: 4 }}>
              {u.description}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12 }}>
              {maxed ? (
                <span className="text-mute">Maxed</span>
              ) : (
                <span style={{ color: affordable ? "var(--gold-500)" : "var(--saddle-400)" }}>
                  {cost?.toLocaleString()} PC
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
