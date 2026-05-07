"use client";

import {
  UPGRADES,
  type UpgradeCategory,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import { nextUpgradeCost } from "@/lib/games/penny-pinchers/engine";

const CATEGORY_LABEL: Record<UpgradeCategory, string> = {
  click: "Click",
  value: "Value",
  spawn: "Spawn",
  automation: "Automation",
};
const CATEGORY_ORDER: UpgradeCategory[] = ["click", "value", "spawn", "automation"];

export function UpgradeShop({
  levels,
  cents,
  onBuy,
}: {
  levels: Record<UpgradeId, number> | Partial<Record<UpgradeId, number>>;
  cents: number;
  onBuy: (id: UpgradeId, cost: number) => void;
}) {
  return (
    <div className="stack" style={{ gap: "var(--sp-2)", overflowY: "auto", maxHeight: 480 }}>
      <style>{`
        @keyframes pp-shop-affordable {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,196,64,0); }
          50%      { box-shadow: 0 0 0 2px rgba(255,196,64,0.45), 0 0 12px rgba(255,196,64,0.5); }
        }
      `}</style>
      {CATEGORY_ORDER.map((cat) => {
        const list = UPGRADES.filter((u) => u.category === cat);
        if (list.length === 0) return null;
        return (
          <div key={cat} className="stack" style={{ gap: 4 }}>
            <div
              className="text-mute"
              style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4 }}
            >
              {CATEGORY_LABEL[cat]}
            </div>
            {list.map((u) => {
              const lvl = levels[u.id] ?? 0;
              const maxed = lvl >= u.maxLevel;
              const cost = nextUpgradeCost(u.id, lvl);
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
                    // Subtle gold glow on affordable cards so the
                    // player has a visible nudge to spend.
                    animation: affordable
                      ? "pp-shop-affordable 1.6s ease-in-out infinite"
                      : undefined,
                    transition: "background 200ms, transform 120ms",
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
                        {cost?.toLocaleString()} PC
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
