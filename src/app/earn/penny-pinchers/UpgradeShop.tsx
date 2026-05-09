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
  recentlyBoughtId,
}: {
  levels: Record<UpgradeId, number> | Partial<Record<UpgradeId, number>>;
  cents: number;
  onBuy: (id: UpgradeId, cost: number) => void;
  /** Higher Ceilings (perm) extends the per-upgrade max levels. */
  perm?: Partial<Record<PermUpgradeId, number>>;
  /** When set, that upgrade's card briefly flashes gold + bumps after a successful purchase. */
  recentlyBoughtId?: UpgradeId | null;
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
        @keyframes pp-upgrade-bought {
          0%   { box-shadow: 0 0 0 0 rgba(255,196,64,0); transform: scale(1); }
          25%  { box-shadow: 0 0 0 5px rgba(255,196,64,1), 0 0 26px rgba(255,196,64,0.95); transform: scale(1.04); }
          100% { box-shadow: 0 0 0 0 rgba(255,196,64,0); transform: scale(1); }
        }
      `}</style>
      {sorted.map((u) => {
        const lvl = levels[u.id] ?? 0;
        const maxLvl = effectiveUpgradeMaxLevel(u, perm ?? {});
        const maxed = lvl >= maxLvl;
        const cost = nextUpgradeCost(u.id, lvl, perm ?? {});
        const affordable = cost != null && cents >= cost;
        const pct = maxLvl > 0 ? Math.min(100, (lvl / maxLvl) * 100) : 0;
        return (
          <button
            key={u.id}
            type="button"
            disabled={maxed || !affordable}
            onClick={() => cost != null && onBuy(u.id, cost)}
            style={{
              position: "relative",
              textAlign: "left",
              background: maxed
                ? "var(--saddle-200)"
                : affordable
                ? "var(--parchment-100)"
                : "var(--parchment-200)",
              border: `3px solid ${affordable ? "var(--gold-300)" : maxed ? "var(--saddle-400)" : "var(--saddle-300)"}`,
              padding: "12px 14px 14px",
              cursor: maxed || !affordable ? "default" : "pointer",
              color: "var(--ink-900)",
              opacity: maxed ? 0.7 : 1,
              animation: recentlyBoughtId === u.id
                ? "pp-upgrade-bought 700ms ease-out"
                : affordable
                ? "pp-shop-affordable 1.6s ease-in-out infinite"
                : undefined,
              transition: "background 200ms, transform 120ms, box-shadow 160ms",
            }}
          >
            {/* Header: category chip + label + level badge */}
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: CATEGORY_BG[u.category],
                    color: CATEGORY_FG[u.category],
                    border: "2px solid var(--ink-900)",
                    padding: "2px 7px",
                    flex: "0 0 auto",
                  }}
                >
                  {CATEGORY_LABEL[u.category]}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 17,
                    color: "var(--ink-900)",
                    lineHeight: 1.15,
                  }}
                >
                  {u.label}
                </span>
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 12,
                  color: "var(--ink-900)",
                  background: "var(--parchment-50)",
                  border: "2px solid var(--ink-900)",
                  padding: "2px 7px",
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                Lv {lvl}/{maxLvl}
              </span>
            </div>
            {/* Description */}
            <div
              className="text-mute"
              style={{
                fontSize: 13,
                lineHeight: 1.35,
                marginBottom: 8,
                color: "var(--saddle-500)",
              }}
            >
              {u.description}
            </div>
            {/* Progress bar — visual depth on partially-leveled upgrades */}
            <div
              aria-hidden
              style={{
                height: 6,
                background: "var(--parchment-50)",
                border: "2px solid var(--ink-900)",
                marginBottom: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: maxed ? "var(--cactus-500)" : "var(--gold-300)",
                  transition: "width 320ms",
                }}
              />
            </div>
            {/* Cost / status — the big call to action */}
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              {maxed ? (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    letterSpacing: "var(--ls-loose)",
                    color: "var(--cactus-500)",
                    textTransform: "uppercase",
                  }}
                >
                  ✓ Maxed
                </span>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    color: affordable ? "var(--gold-500)" : "var(--saddle-400)",
                    textShadow: affordable ? "1px 1px 0 var(--gold-100)" : undefined,
                  }}
                >
                  {cost?.toLocaleString()} <span style={{ fontSize: 12, opacity: 0.85 }}>PC</span>
                </span>
              )}
              {!maxed && affordable && (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    letterSpacing: "var(--ls-loose)",
                    textTransform: "uppercase",
                    color: "var(--cactus-500)",
                  }}
                >
                  ✦ Affordable
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
