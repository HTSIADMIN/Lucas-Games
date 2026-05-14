"use client";

import { useEffect, useState } from "react";
import {
  UPGRADES,
  type PermUpgradeId,
  type UpgradeCategory,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import {
  effectiveUpgradeMaxLevel,
  nextUpgradeCost,
  upgradeCurrentValueLabel,
} from "@/lib/games/penny-pinchers/engine";
import { formatPC } from "@/lib/games/penny-pinchers/format";

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
  onBuyMax,
  perm,
  recentlyBoughtId,
}: {
  levels: Record<UpgradeId, number> | Partial<Record<UpgradeId, number>>;
  cents: number;
  onBuy: (id: UpgradeId, cost: number) => void;
  /** Greedy max-buy — buys the cheapest affordable upgrade in a loop
   *  until nothing is affordable. Parent runs the engine mutation and
   *  returns a summary of what landed (or null if nothing was bought). */
  onBuyMax?: () => { bought: number; spent: number } | null;
  /** Higher Ceilings (perm) extends the per-upgrade max levels. */
  perm?: Partial<Record<PermUpgradeId, number>>;
  /** When set, that upgrade's card briefly flashes gold + bumps after a successful purchase. */
  recentlyBoughtId?: UpgradeId | null;
}) {
  // Flat sort — categories live as little chips on each card and
  // the list ranks strictly by next-level cost ascending so the
  // cheapest upgrade is always at the top of the scroll. Maxed
  // upgrades sink to the bottom regardless.
  const sorted = UPGRADES.slice().sort((a, b) => {
    const aLvl = levels[a.id] ?? 0;
    const bLvl = levels[b.id] ?? 0;
    const aMaxed = aLvl >= effectiveUpgradeMaxLevel(a, perm ?? {});
    const bMaxed = bLvl >= effectiveUpgradeMaxLevel(b, perm ?? {});
    if (aMaxed !== bMaxed) return aMaxed ? 1 : -1;
    if (aMaxed) return 0;
    const aCost = nextUpgradeCost(a.id, aLvl, perm ?? {}) ?? Number.POSITIVE_INFINITY;
    const bCost = nextUpgradeCost(b.id, bLvl, perm ?? {}) ?? Number.POSITIVE_INFINITY;
    return aCost - bCost;
  });

  // Cheapest upgrade currently in reach — gates the Max Buy button.
  const cheapestAffordable = (() => {
    let cheapest = Number.POSITIVE_INFINITY;
    for (const u of UPGRADES) {
      const lvl = levels[u.id] ?? 0;
      if (lvl >= effectiveUpgradeMaxLevel(u, perm ?? {})) continue;
      const c = nextUpgradeCost(u.id, lvl, perm ?? {});
      if (c == null || c > cents) continue;
      if (c < cheapest) cheapest = c;
    }
    return cheapest === Number.POSITIVE_INFINITY ? null : cheapest;
  })();

  const [toast, setToast] = useState<{ bought: number; spent: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function handleBuyMax() {
    if (!onBuyMax) return;
    const result = onBuyMax();
    if (result && result.bought > 0) setToast(result);
  }

  return (
    <div className="stack pp-shop-scroll" style={{ gap: "var(--sp-2)" }}>
      {onBuyMax && (
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            minHeight: 30,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: toast ? "var(--cactus-500)" : "var(--saddle-400)",
              transition: "color 200ms",
            }}
          >
            {toast
              ? `Bought ${toast.bought} for ${formatPC(toast.spent)} PC`
              : "Cheapest first · stops when broke"}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={cheapestAffordable == null}
            onClick={handleBuyMax}
            style={{
              animation:
                cheapestAffordable != null && !toast
                  ? "pp-maxbuy-pulse 1.8s ease-in-out infinite"
                  : undefined,
            }}
          >
            ⚡ Max Buy
          </button>
        </div>
      )}
      <style>{`
        @keyframes pp-maxbuy-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,196,64,0); }
          50%      { box-shadow: 0 0 0 2px rgba(255,196,64,0.55), 0 0 12px rgba(255,196,64,0.45); }
        }
      `}</style>
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
                marginBottom: 6,
                color: "var(--saddle-500)",
              }}
            >
              {u.description}
            </div>
            {/* Currently-X — surfaces the live effect for the player's
                current level, no description math needed. */}
            {(() => {
              const cur = upgradeCurrentValueLabel(u.id, lvl);
              if (!cur) return null;
              return (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    color: maxed ? "var(--cactus-500)" : "var(--gold-500)",
                    marginBottom: 8,
                  }}
                >
                  Currently: {cur}
                </div>
              );
            })()}
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
                  {cost != null ? formatPC(cost) : ""} <span style={{ fontSize: 12, opacity: 0.85 }}>PC</span>
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
