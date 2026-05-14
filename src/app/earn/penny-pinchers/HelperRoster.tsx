"use client";

import { useEffect, useState } from "react";
import { HELPERS, type HelperId } from "@/lib/games/penny-pinchers/catalog";
import { nextHelperCost } from "@/lib/games/penny-pinchers/engine";

export function HelperRoster({
  counts,
  cents,
  onHire,
  onHireMax,
  recentlyHiredId,
}: {
  counts: Record<HelperId, number> | Partial<Record<HelperId, number>>;
  cents: number;
  onHire: (id: HelperId, cost: number) => void;
  /** Greedy max-hire — hires the cheapest affordable helper in a
   *  loop until nothing is affordable. */
  onHireMax?: () => { hired: number; spent: number } | null;
  /** When set, that helper's row briefly flashes gold after a successful hire. */
  recentlyHiredId?: HelperId | null;
}) {
  // Cheapest helper currently in reach — gates the Max Hire button.
  const cheapestAffordable = (() => {
    let cheapest = Number.POSITIVE_INFINITY;
    for (const h of HELPERS) {
      const owned = counts[h.id] ?? 0;
      if (owned >= h.maxOwn) continue;
      const c = nextHelperCost(h.id, owned);
      if (c == null || c > cents) continue;
      if (c < cheapest) cheapest = c;
    }
    return cheapest === Number.POSITIVE_INFINITY ? null : cheapest;
  })();

  const [toast, setToast] = useState<{ hired: number; spent: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function handleHireMax() {
    if (!onHireMax) return;
    const result = onHireMax();
    if (result && result.hired > 0) setToast(result);
  }

  return (
    <div className="stack pp-shop-scroll" style={{ gap: "var(--sp-2)" }}>
      {onHireMax && (
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
              ? `Hired ${toast.hired} for ${toast.spent.toLocaleString()} PC`
              : "Cheapest first · stops when broke"}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={cheapestAffordable == null}
            onClick={handleHireMax}
            style={{
              animation:
                cheapestAffordable != null && !toast
                  ? "pp-maxbuy-pulse 1.8s ease-in-out infinite"
                  : undefined,
            }}
          >
            ⚡ Max Hire
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
        @keyframes pp-helper-hired {
          0%   { box-shadow: 0 0 0 0 rgba(255,196,64,0); transform: scale(1); }
          30%  { box-shadow: 0 0 0 4px rgba(255,196,64,0.95), 0 0 22px rgba(255,196,64,0.95); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 0 rgba(255,196,64,0); transform: scale(1); }
        }
      `}</style>
      {/* Cheapest hire first; maxed helpers sink to the bottom. */}
      {HELPERS.slice().sort((a, b) => {
        const aOwned = counts[a.id] ?? 0;
        const bOwned = counts[b.id] ?? 0;
        const aMaxed = aOwned >= a.maxOwn;
        const bMaxed = bOwned >= b.maxOwn;
        if (aMaxed !== bMaxed) return aMaxed ? 1 : -1;
        if (aMaxed) return 0;
        const aCost = nextHelperCost(a.id, aOwned) ?? Number.POSITIVE_INFINITY;
        const bCost = nextHelperCost(b.id, bOwned) ?? Number.POSITIVE_INFINITY;
        return aCost - bCost;
      }).map((h) => {
        const owned = counts[h.id] ?? 0;
        const maxed = owned >= h.maxOwn;
        const cost = nextHelperCost(h.id, owned);
        const affordable = cost != null && cents >= cost;
        const pct = h.maxOwn > 0 ? Math.min(100, (owned / h.maxOwn) * 100) : 0;
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
              border: `3px solid ${affordable ? "var(--gold-300)" : maxed ? "var(--saddle-400)" : "var(--saddle-300)"}`,
              padding: "12px 14px 14px",
              cursor: maxed || !affordable ? "default" : "pointer",
              color: "var(--ink-900)",
              opacity: maxed ? 0.7 : 1,
              animation: recentlyHiredId === h.id
                ? "pp-helper-hired 700ms ease-out"
                : affordable
                ? "pp-shop-affordable 1.6s ease-in-out infinite"
                : undefined,
              transition: "background 200ms",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  color: "var(--ink-900)",
                  lineHeight: 1.15,
                }}
              >
                {h.label}
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
                {owned}/{h.maxOwn}
              </span>
            </div>
            <div className="text-mute" style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 8, color: "var(--saddle-500)" }}>
              {h.description}
            </div>
            {/* Income chip — the helper's headline value */}
            <div
              style={{
                display: "inline-block",
                fontFamily: "var(--font-display)",
                fontSize: 13,
                color: "var(--ink-900)",
                background: "var(--surface-highlight)",
                border: "2px solid var(--gold-300)",
                padding: "3px 8px",
                marginBottom: 8,
              }}
            >
              +{h.pcPerSec} PC/sec each
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
                  ✦ Hire now
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
