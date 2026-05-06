"use client";

import { HELPERS, type HelperId } from "@/lib/games/penny-pinchers/catalog";
import { nextHelperCost } from "@/lib/games/penny-pinchers/engine";

export function HelperRoster({
  counts,
  cents,
  onHire,
}: {
  counts: Record<HelperId, number> | Partial<Record<HelperId, number>>;
  cents: number;
  onHire: (id: HelperId, cost: number) => void;
}) {
  return (
    <div className="stack" style={{ gap: "var(--sp-2)", overflowY: "auto", maxHeight: 480 }}>
      {HELPERS.map((h) => {
        const owned = counts[h.id] ?? 0;
        const maxed = owned >= h.maxOwn;
        const cost = nextHelperCost(h.id, owned);
        const affordable = cost != null && cents >= cost;
        return (
          <button
            key={h.id}
            type="button"
            disabled={maxed || !affordable}
            onClick={() => cost != null && onHire(h.id, cost)}
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
                {h.label}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--saddle-400)" }}>
                Owned {owned}/{h.maxOwn}
              </span>
            </div>
            <div className="text-mute" style={{ fontSize: 11, marginBottom: 4 }}>
              {h.description}
            </div>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 12 }}>
                +{h.pcPerSec} PC/sec each
              </span>
              {maxed ? (
                <span className="text-mute" style={{ fontSize: 12 }}>Maxed</span>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                    color: affordable ? "var(--gold-500)" : "var(--saddle-400)",
                  }}
                >
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
