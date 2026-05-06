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
                    border: "2px solid var(--saddle-300)",
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
