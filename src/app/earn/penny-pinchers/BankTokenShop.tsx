"use client";

import { PERM_UPGRADES, type PermUpgradeId } from "@/lib/games/penny-pinchers/catalog";
import { nextPermUpgradeCost } from "@/lib/games/penny-pinchers/engine";

export function BankTokenShop({
  levels,
  bankTokens,
  onBuy,
}: {
  levels: Record<PermUpgradeId, number> | Partial<Record<PermUpgradeId, number>>;
  bankTokens: number;
  onBuy: (id: PermUpgradeId, cost: number) => void;
}) {
  return (
    <div className="stack" style={{ gap: "var(--sp-2)", overflowY: "auto", maxHeight: 480 }}>
      <div
        className="text-mute"
        style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4 }}
      >
        Permanent — survives every Roll It Up
      </div>
      {PERM_UPGRADES.map((u) => {
        const lvl = levels[u.id] ?? 0;
        const maxed = lvl >= u.maxLevel;
        const cost = nextPermUpgradeCost(u.id, lvl);
        const affordable = cost != null && bankTokens >= cost;
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
                ? "var(--gold-100)"
                : "var(--parchment-200)",
              border: `2px solid ${affordable ? "var(--gold-300)" : "var(--saddle-300)"}`,
              padding: "8px 10px",
              cursor: maxed || !affordable ? "default" : "pointer",
              color: "var(--ink-900)",
              opacity: maxed ? 0.55 : 1,
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--ink-900)" }}>
                {u.label}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--saddle-400)" }}>
                Lv {lvl}/{u.maxLevel}
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
                  {cost} ★ Token{cost === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
