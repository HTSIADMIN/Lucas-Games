"use client";

import { PERM_UPGRADES, type PermUpgradeId } from "@/lib/games/penny-pinchers/catalog";
import { nextPermUpgradeCost } from "@/lib/games/penny-pinchers/engine";

export function BankTokenShop({
  levels,
  bankTokens,
  onBuy,
  recentlyBoughtId,
}: {
  levels: Record<PermUpgradeId, number> | Partial<Record<PermUpgradeId, number>>;
  bankTokens: number;
  onBuy: (id: PermUpgradeId, cost: number) => void;
  /** Briefly flashes + bumps the matching card after a successful purchase. */
  recentlyBoughtId?: PermUpgradeId | null;
}) {
  return (
    <div className="stack pp-shop-scroll" style={{ gap: "var(--sp-2)" }}>
      <style>{`
        @keyframes pp-upgrade-bought {
          0%   { box-shadow: 0 0 0 0 rgba(255,196,64,0); transform: scale(1); }
          25%  { box-shadow: 0 0 0 5px rgba(255,196,64,1), 0 0 26px rgba(255,196,64,0.95); transform: scale(1.04); }
          100% { box-shadow: 0 0 0 0 rgba(255,196,64,0); transform: scale(1); }
        }
      `}</style>
      <div
        className="text-mute"
        style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4 }}
      >
        Permanent — survives every Roll It Up
      </div>
      {/* Maxed perm upgrades sink to the bottom; affordable rises. */}
      {PERM_UPGRADES.slice().sort((a, b) => {
        const aLvl = levels[a.id] ?? 0;
        const bLvl = levels[b.id] ?? 0;
        const aMaxed = aLvl >= a.maxLevel;
        const bMaxed = bLvl >= b.maxLevel;
        if (aMaxed !== bMaxed) return aMaxed ? 1 : -1;
        if (aMaxed) return 0;
        const aCost = nextPermUpgradeCost(a.id, aLvl);
        const bCost = nextPermUpgradeCost(b.id, bLvl);
        const aAff = aCost != null && bankTokens >= aCost;
        const bAff = bCost != null && bankTokens >= bCost;
        if (aAff !== bAff) return aAff ? -1 : 1;
        return 0;
      }).map((u) => {
        const lvl = levels[u.id] ?? 0;
        const maxed = lvl >= u.maxLevel;
        const cost = nextPermUpgradeCost(u.id, lvl);
        const affordable = cost != null && bankTokens >= cost;
        const pct = u.maxLevel > 0 ? Math.min(100, (lvl / u.maxLevel) * 100) : 0;
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
                ? "var(--surface-highlight)"
                : "var(--parchment-200)",
              border: `3px solid ${affordable ? "var(--gold-300)" : maxed ? "var(--saddle-400)" : "var(--saddle-300)"}`,
              padding: "12px 14px 14px",
              cursor: maxed || !affordable ? "default" : "pointer",
              color: "var(--ink-900)",
              opacity: maxed ? 0.7 : 1,
              animation: recentlyBoughtId === u.id ? "pp-upgrade-bought 700ms ease-out" : undefined,
              transition: "transform 120ms, box-shadow 160ms",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink-900)", lineHeight: 1.15 }}>
                {u.label}
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
                Lv {lvl}/{u.maxLevel}
              </span>
            </div>
            <div className="text-mute" style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 8, color: "var(--saddle-500)" }}>
              {u.description}
            </div>
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
                  {cost} <span style={{ fontSize: 12, opacity: 0.85 }}>★ Token{cost === 1 ? "" : "s"}</span>
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
