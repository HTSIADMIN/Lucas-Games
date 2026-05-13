"use client";

import { useEffect, useMemo, useState } from "react";
import * as Sfx from "@/lib/sfx";
import {
  CHESTS,
  RELICS,
  RELICS_BY_ID,
  type ChestTier,
  type RelicDef,
  type RelicId,
  type RelicRarity,
} from "@/lib/games/penny-pinchers/catalog";

const RARITY_COLOR: Record<RelicRarity, { ring: string; bg: string; fg: string }> = {
  common:    { ring: "#9aa0aa", bg: "var(--parchment-200)", fg: "var(--ink-900)" },
  uncommon:  { ring: "#5fa17a", bg: "var(--cactus-300)",    fg: "var(--parchment-50)" },
  rare:      { ring: "#3d8aff", bg: "var(--sky-300)",       fg: "var(--parchment-50)" },
  epic:      { ring: "#a855f7", bg: "#5a3a7a",              fg: "var(--parchment-50)" },
  legendary: { ring: "#f5c842", bg: "var(--gold-300)",      fg: "var(--ink-900)" },
};

const ICON_OUTLINE = "#1a0f08";

/**
 * Inline pixel-art glyphs themed as ancient artifacts — one per
 * relic. Built from layered axis-aligned shapes (base fill → shadow
 * → highlight → accents) so each one reads like a chunky bitmap
 * icon in the game's saloon style. No gradients, no rounded
 * corners, no anti-aliased curves where avoidable.
 */
function RelicIcon({ id, size = 48 }: { id: RelicId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    style: { display: "block" },
    "aria-hidden": true as const,
  };
  switch (id) {
    case "lucky_charm":
      // Iron horseshoe — thick U with rivets, wear marks, faint
      // highlight along the inner-left edge.
      return (
        <svg {...common}>
          <path d="M5.5 3.5 V12 Q5.5 17 12 17 Q18.5 17 18.5 12 V3.5" fill="none" stroke={ICON_OUTLINE} strokeWidth="7" strokeLinejoin="miter" />
          <path d="M5.5 3.5 V12 Q5.5 17 12 17 Q18.5 17 18.5 12 V3.5" fill="none" stroke="#b0b4bc" strokeWidth="4.6" strokeLinejoin="miter" />
          <path d="M4 4 V12 Q4 14 5 16" fill="none" stroke="#d4d8dc" strokeWidth="0.6" />
          <rect x="4.4" y="4.8" width="1.4" height="1.4" fill={ICON_OUTLINE} />
          <rect x="4.4" y="9" width="1.4" height="1.4" fill={ICON_OUTLINE} />
          <rect x="6.4" y="14.6" width="1.4" height="1.4" fill={ICON_OUTLINE} />
          <rect x="16.2" y="14.6" width="1.4" height="1.4" fill={ICON_OUTLINE} />
          <rect x="18.2" y="9" width="1.4" height="1.4" fill={ICON_OUTLINE} />
          <rect x="18.2" y="4.8" width="1.4" height="1.4" fill={ICON_OUTLINE} />
          <rect x="10.5" y="6.5" width="3" height="0.6" fill="#707078" opacity="0.55" />
          <rect x="9" y="9" width="2" height="0.5" fill="#707078" opacity="0.4" />
          <rect x="13" y="11" width="2" height="0.5" fill="#707078" opacity="0.4" />
        </svg>
      );

    case "helping_hand":
      // Bronze votive hand with a wrist cuff and palm-line etching.
      return (
        <svg {...common}>
          <rect x="7" y="8.5" width="10" height="10.5" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="4" y="11" width="3" height="6" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="7" y="4" width="2" height="5" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="10" y="2.5" width="2" height="6.5" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="13" y="3" width="2" height="6" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="16" y="5.5" width="2" height="3.5" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="7" y="18" width="10" height="3" fill="#6a3818" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="11" y="19.2" width="2" height="0.8" fill="#e8c468" />
          <rect x="9" y="11" width="6" height="0.6" fill="#6a3818" />
          <rect x="9" y="13" width="6" height="0.6" fill="#6a3818" />
          <rect x="9" y="15" width="6" height="0.6" fill="#6a3818" />
          <rect x="7.6" y="8.8" width="0.8" height="4" fill="#d49060" />
        </svg>
      );

    case "midas_thumb":
      // Golden fist, thumb up, with knuckles, cuff and a glint.
      return (
        <svg {...common}>
          <rect x="6" y="13" width="3" height="8" fill="#c89030" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="6" y="19" width="3" height="2" fill="#a87018" />
          <rect x="9" y="9" width="11" height="12" fill="#e8c468" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="12" y="2" width="3" height="8" fill="#e8c468" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="15" y="4" width="0.8" height="3.5" fill={ICON_OUTLINE} />
          <rect x="9" y="12" width="11" height="0.7" fill="#a87018" />
          <rect x="9" y="15.5" width="11" height="0.7" fill="#a87018" />
          <rect x="9" y="19" width="11" height="0.7" fill="#a87018" />
          <rect x="9.5" y="10" width="1" height="9" fill="#f5e090" />
          <rect x="12.6" y="2.6" width="0.8" height="6" fill="#f5e090" />
          <polygon points="18,3 19,4.5 20.5,4 19.5,5.5 21,7 19,7 18,8.5 17,7 15,7 16.5,5.5 15.5,4 17,4.5" fill="#fff8e2" opacity="0.85" />
        </svg>
      );

    case "fast_fingers":
      // Winged lightning bolt with speed streaks.
      return (
        <svg {...common}>
          <polygon points="2.5,9 5,9 4,11 6,11 5.2,12.4" fill="#cfcfcf" stroke={ICON_OUTLINE} strokeWidth="0.8" strokeLinejoin="miter" />
          <polygon points="2.5,15 5,13 4,15 6,14 5.2,16" fill="#cfcfcf" stroke={ICON_OUTLINE} strokeWidth="0.8" strokeLinejoin="miter" />
          <polygon points="21.5,9 19,9 20,11 18,11 18.8,12.4" fill="#cfcfcf" stroke={ICON_OUTLINE} strokeWidth="0.8" strokeLinejoin="miter" />
          <polygon points="21.5,15 19,13 20,15 18,14 18.8,16" fill="#cfcfcf" stroke={ICON_OUTLINE} strokeWidth="0.8" strokeLinejoin="miter" />
          <polygon points="14,2 7,12 11,12 9,22 17,10 13,10 15,2" fill="#f5c842" stroke={ICON_OUTLINE} strokeWidth="1.5" strokeLinejoin="miter" />
          <polygon points="13.5,3 9,11 11.5,11 14.5,4" fill="#fff8a2" opacity="0.6" />
        </svg>
      );

    case "thick_pockets":
      // Drawstring coin pouch, $ stamped on front, coins spilling out.
      return (
        <svg {...common}>
          <rect x="9" y="3.5" width="6" height="3" fill="#6a4020" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="10" y="2.5" width="1" height="1.5" fill="#6a4020" />
          <rect x="13" y="2.5" width="1" height="1.5" fill="#6a4020" />
          <polygon points="5,9 7,6.5 17,6.5 19,9 20,18.5 4,18.5" fill="#8a5a2a" stroke={ICON_OUTLINE} strokeWidth="1.4" strokeLinejoin="miter" />
          <polygon points="5,9 7,6.5 8,6.5 6.5,9 7.5,17 6,17" fill="#6a4020" />
          <rect x="14" y="9.5" width="4" height="7" fill="#6a4020" opacity="0.35" />
          <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#f5c842" fontFamily="monospace" stroke={ICON_OUTLINE} strokeWidth="0.4">
            $
          </text>
          <circle cx="6" cy="20" r="1.6" fill="#e8c468" stroke={ICON_OUTLINE} strokeWidth="0.8" />
          <circle cx="9" cy="20.5" r="1.3" fill="#c89030" stroke={ICON_OUTLINE} strokeWidth="0.8" />
          <circle cx="18" cy="20" r="1.5" fill="#e8c468" stroke={ICON_OUTLINE} strokeWidth="0.8" />
          <rect x="5.6" y="19.6" width="0.6" height="0.4" fill="#fff8e2" />
          <rect x="17.6" y="19.6" width="0.6" height="0.4" fill="#fff8e2" />
        </svg>
      );

    case "merchant_seal":
      // Wax cylinder seal with star imprint and twin ribbon tails.
      return (
        <svg {...common}>
          <polygon points="9,18 7,23 10,21" fill="#5d2828" stroke={ICON_OUTLINE} strokeWidth="1" strokeLinejoin="miter" />
          <polygon points="15,18 17,23 14,21" fill="#5d2828" stroke={ICON_OUTLINE} strokeWidth="1" strokeLinejoin="miter" />
          <polygon points="12,2.5 17,4.5 20,9.5 20,13.5 17,18.5 12,20 7,18.5 4,13.5 4,9.5 7,4.5" fill="#a82a1a" stroke={ICON_OUTLINE} strokeWidth="1.5" strokeLinejoin="miter" />
          <polygon points="12,3.5 17,5.5 19,9.5 19,13 17,17 12,18 7,17 5,13 5,9.5 7,5.5" fill="none" stroke="#d44a30" strokeWidth="0.6" strokeLinejoin="miter" />
          <polygon points="12,6.5 13.6,10 17.4,10 14.4,12.4 15.4,16 12,13.8 8.6,16 9.6,12.4 6.6,10 10.4,10" fill="#f5c842" stroke={ICON_OUTLINE} strokeWidth="0.6" strokeLinejoin="miter" />
          <polygon points="12,6.5 13.6,10 12,10.5" fill="#fff8a2" opacity="0.7" />
          <rect x="6" y="6" width="1" height="3" fill="#d44a30" />
        </svg>
      );

    case "saints_mark":
      // Radiant halo over a Latin cross — rays burst behind.
      return (
        <svg {...common}>
          <g stroke="#f5c842" strokeWidth="0.8" strokeLinecap="butt">
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="5" y1="3" x2="6.4" y2="4.4" />
            <line x1="19" y1="3" x2="17.6" y2="4.4" />
            <line x1="3" y1="9" x2="5" y2="9" />
            <line x1="19" y1="9" x2="21" y2="9" />
            <line x1="5" y1="15" x2="6.4" y2="13.6" />
            <line x1="19" y1="15" x2="17.6" y2="13.6" />
          </g>
          <circle cx="12" cy="9" r="5.8" fill="none" stroke={ICON_OUTLINE} strokeWidth="3" />
          <circle cx="12" cy="9" r="5.8" fill="none" stroke="#f5c842" strokeWidth="1.8" />
          <circle cx="12" cy="9" r="3.2" fill="none" stroke="#fff8a2" strokeWidth="0.6" />
          <rect x="11" y="11" width="2" height="10" fill="#c89030" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="8" y="14" width="8" height="2" fill="#c89030" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="11.3" y="11.5" width="0.6" height="9" fill="#f5e090" />
          <rect x="8.5" y="14.4" width="7" height="0.5" fill="#f5e090" />
        </svg>
      );

    case "rainmaker":
      // Storm cloud with an embedded lightning bolt and falling drops.
      return (
        <svg {...common}>
          <g stroke="#5a6878" strokeWidth="1.2">
            <line x1="3" y1="8" x2="4.5" y2="8" />
            <line x1="20" y1="6" x2="21" y2="6" />
          </g>
          <path d="M4 11 Q4 7 8 7 Q10 3 14 5 Q19 4 20 9 Q23 9.5 22 13 Q22 14.5 20 14.5 H6 Q3 14.5 4 11 Z" fill="#7a8a9a" stroke={ICON_OUTLINE} strokeWidth="1.4" strokeLinejoin="miter" />
          <path d="M4 11 Q4 7 8 7 Q10 3 14 5" fill="none" stroke="#9aabbc" strokeWidth="0.8" />
          <path d="M6 14 Q4 13 4 11" fill="none" stroke="#5a6878" strokeWidth="0.8" />
          <polygon points="12,12 9.5,16 11.5,16 10,19.5 14,15 12,15 13.5,12" fill="#f5c842" stroke={ICON_OUTLINE} strokeWidth="0.9" strokeLinejoin="miter" />
          <path d="M7 16 L6 19 L8 18 Z" fill="#5d8fc4" stroke={ICON_OUTLINE} strokeWidth="0.8" />
          <path d="M16 16 L15 19 L17 18 Z" fill="#5d8fc4" stroke={ICON_OUTLINE} strokeWidth="0.8" />
          <path d="M19 17 L18 20 L20 19 Z" fill="#5d8fc4" stroke={ICON_OUTLINE} strokeWidth="0.8" />
        </svg>
      );

    case "ancient_idol":
      // Stone tiki bust: feathered headdress, gem brow, bared teeth,
      // stepped pedestal.
      return (
        <svg {...common}>
          <polygon points="12,1.5 9,4.5 15,4.5" fill="#3a8a52" stroke={ICON_OUTLINE} strokeWidth="1.2" strokeLinejoin="miter" />
          <polygon points="9,4.5 10.5,3.5 11.5,4.5" fill="#5fa17a" />
          <polygon points="12.5,4.5 13.5,3.5 14.5,4.5" fill="#5fa17a" />
          <rect x="6.5" y="4.5" width="11" height="13" fill="#9a8a6a" stroke={ICON_OUTLINE} strokeWidth="1.4" />
          <rect x="6.5" y="4.5" width="11" height="1.3" fill="#bca890" />
          <rect x="6.5" y="16.2" width="11" height="1.3" fill="#6a5a4a" />
          <rect x="11" y="6" width="2" height="2" fill="#c8392a" stroke={ICON_OUTLINE} strokeWidth="0.6" />
          <rect x="11.4" y="6.4" width="0.6" height="0.6" fill="#fff8a2" />
          <rect x="8.5" y="9" width="2" height="2" fill={ICON_OUTLINE} />
          <rect x="13.5" y="9" width="2" height="2" fill={ICON_OUTLINE} />
          <rect x="9" y="9.3" width="0.6" height="0.6" fill="#f5c842" />
          <rect x="14" y="9.3" width="0.6" height="0.6" fill="#f5c842" />
          <polygon points="11,12 13,12 12.5,14.5 11.5,14.5" fill="#6a5a4a" stroke={ICON_OUTLINE} strokeWidth="0.5" />
          <rect x="8.5" y="14.8" width="7" height="1.8" fill={ICON_OUTLINE} />
          <rect x="9.3" y="14.8" width="0.9" height="1.8" fill="#fff8e2" />
          <rect x="11" y="14.8" width="0.9" height="1.8" fill="#fff8e2" />
          <rect x="12.6" y="14.8" width="0.9" height="1.8" fill="#fff8e2" />
          <rect x="14.3" y="14.8" width="0.9" height="1.8" fill="#fff8e2" />
          <rect x="5.5" y="17.5" width="13" height="2.3" fill="#6a4a2a" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="4.5" y="19.8" width="15" height="2.3" fill="#5a3a1a" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="5.5" y="17.5" width="13" height="0.6" fill="#8a6a3a" />
        </svg>
      );

    case "fortunes_eye":
      // Pyramid with capstone eye + radiating rays.
      return (
        <svg {...common}>
          <g stroke="#e8c468" strokeWidth="0.8">
            <line x1="12" y1="1" x2="12" y2="2.5" />
            <line x1="4" y1="6" x2="5.5" y2="7" />
            <line x1="20" y1="6" x2="18.5" y2="7" />
            <line x1="2" y1="13" x2="4" y2="13" />
            <line x1="20" y1="13" x2="22" y2="13" />
          </g>
          <polygon points="12,3 21,20 3,20" fill="#c89030" stroke={ICON_OUTLINE} strokeWidth="1.5" strokeLinejoin="miter" />
          <polygon points="12,3 21,20 12,20" fill="#a87018" />
          <line x1="3.8" y1="18.5" x2="20.2" y2="18.5" stroke={ICON_OUTLINE} strokeWidth="0.7" />
          <line x1="6" y1="15" x2="18" y2="15" stroke={ICON_OUTLINE} strokeWidth="0.7" />
          <line x1="8" y1="11.5" x2="16" y2="11.5" stroke={ICON_OUTLINE} strokeWidth="0.7" />
          <line x1="10" y1="8" x2="14" y2="8" stroke={ICON_OUTLINE} strokeWidth="0.7" />
          <polygon points="12,9 16,13 12,17 8,13" fill="#fff8e2" stroke={ICON_OUTLINE} strokeWidth="1.2" strokeLinejoin="miter" />
          <circle cx="12" cy="13" r="1.6" fill={ICON_OUTLINE} />
          <circle cx="12" cy="13" r="0.8" fill="#5d8fc4" />
          <rect x="11.6" y="12.6" width="0.5" height="0.5" fill="#fff8e2" />
        </svg>
      );

    case "merging_hands":
      // Two clasped hands — a handshake — with metal cuffs and a
      // small spark at the join.
      return (
        <svg {...common}>
          <rect x="2" y="11" width="4" height="6" fill="#5a3a1a" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="18" y="11" width="4" height="6" fill="#5a3a1a" stroke={ICON_OUTLINE} strokeWidth="1.2" />
          <rect x="2" y="11.5" width="4" height="1" fill="#c89030" />
          <rect x="18" y="11.5" width="4" height="1" fill="#c89030" />
          <rect x="2" y="15.5" width="4" height="1" fill="#c89030" />
          <rect x="18" y="15.5" width="4" height="1" fill="#c89030" />
          <polygon points="6,10 12,12 12,16 6,18" fill="#c8884a" stroke={ICON_OUTLINE} strokeWidth="1.2" strokeLinejoin="miter" />
          <polygon points="18,10 12,12 12,16 18,18" fill="#a86838" stroke={ICON_OUTLINE} strokeWidth="1.2" strokeLinejoin="miter" />
          <rect x="11" y="11.5" width="2" height="5" fill="#6a3818" stroke={ICON_OUTLINE} strokeWidth="0.8" />
          <rect x="7" y="11" width="1" height="0.8" fill={ICON_OUTLINE} />
          <rect x="9" y="11.4" width="1" height="0.8" fill={ICON_OUTLINE} />
          <rect x="14" y="11.4" width="1" height="0.8" fill={ICON_OUTLINE} />
          <rect x="16" y="11" width="1" height="0.8" fill={ICON_OUTLINE} />
          <polygon points="12,7 12.8,9 14.5,9 13.2,10.2 13.8,12 12,11 10.2,12 10.8,10.2 9.5,9 11.2,9" fill="#f5c842" stroke={ICON_OUTLINE} strokeWidth="0.6" strokeLinejoin="miter" />
          <rect x="11.7" y="8" width="0.6" height="2" fill="#fff8a2" />
        </svg>
      );
  }
  // Exhaustiveness fallback — every RelicId is covered above; keeps
  // TypeScript happy if the union is extended without a new case.
  return null;
}

/** Result of opening a chest. Parent computes this via the engine
 *  (applyOpenChest) and hands it back so RelicShop can drive the
 *  spin animation. */
export type ChestRollResult = {
  tier: ChestTier;
  relicId: RelicId;
  label: string;
  rarity: RelicRarity;
  description: string;
  newLevel: number;
  maxLevel: number;
  duplicateAtMax: boolean;
  /** Frugality refunded when the roll lands on an already-maxed relic. */
  refund: number;
};

export function RelicShop({
  frugality,
  relics,
  onBuyChest,
}: {
  frugality: number;
  relics: Record<string, number>;
  /** Runs the chest roll on the parent's game state and returns
   *  the result for the spin animation. Returns null if the buy
   *  was rejected (e.g. not enough Frugality). */
  onBuyChest: (tier: ChestTier) => ChestRollResult | null;
}) {
  const [busy, setBusy] = useState<ChestTier | null>(null);
  const [reveal, setReveal] = useState<ChestRollResult | null>(null);

  function buyChest(tier: ChestTier) {
    if (busy) return;
    const cost = CHESTS[tier].cost;
    if (frugality < cost) return;
    setBusy(tier);
    Sfx.play("pack.open");
    const result = onBuyChest(tier);
    if (result) setReveal(result);
    setBusy(null);
  }

  return (
    <div className="stack pp-shop-scroll" style={{ gap: "var(--sp-2)" }}>
      <style>{`
        .pp-chest-card {
          transition: transform 160ms, box-shadow 200ms, border-color 200ms;
        }
        .pp-chest-card:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 0 2px var(--gold-300), 0 6px 18px rgba(0,0,0,0.25);
        }
        .pp-chest-card:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 0 0 2px var(--gold-300), 0 2px 6px rgba(0,0,0,0.2);
        }
      `}</style>
      <div
        className="text-mute"
        style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4 }}
      >
        Spend Frugality on chests · keeps relics through Prestige
      </div>

      {/* Chest cards */}
      {(Object.keys(CHESTS) as ChestTier[]).map((tier) => {
        const def = CHESTS[tier];
        const affordable = frugality >= def.cost;
        return (
          <button
            key={tier}
            type="button"
            disabled={!affordable || busy != null}
            onClick={() => buyChest(tier)}
            className="pp-chest-card"
            style={{
              textAlign: "left",
              background: affordable
                ? tier === "gold" ? "var(--gold-100)"
                : tier === "silver" ? "var(--parchment-100)"
                : "var(--parchment-200)"
                : "var(--parchment-200)",
              border: `2px solid ${
                tier === "gold"   ? "var(--gold-300)"
              : tier === "silver" ? "var(--saddle-300)"
              :                     "var(--saddle-300)"
              }`,
              padding: "10px 12px",
              cursor: affordable && busy == null ? "pointer" : "default",
              color: "var(--ink-900)",
              opacity: affordable ? 1 : 0.6,
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>
                {def.label}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--cactus-500)" }}>
                {def.cost} ✓
              </span>
            </div>
            <div className="text-mute" style={{ fontSize: 11, marginTop: 2 }}>
              {summariseWeights(def.weights)}
            </div>
          </button>
        );
      })}

      {/* Owned relics list */}
      <div
        className="text-mute"
        style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4, marginTop: "var(--sp-2)" }}
      >
        Owned Relics
      </div>
      {/* Sort: in-progress relics (owned but not maxed) at top so the
          player can see what's leveling up, unstarted in the middle
          (still goals), maxed-out sink to the bottom. */}
      {RELICS.slice().sort((a, b) => {
        const aLvl = relics[a.id] ?? 0;
        const bLvl = relics[b.id] ?? 0;
        const rank = (lvl: number, max: number) => {
          if (lvl >= max && max > 0) return 2; // maxed → bottom
          if (lvl > 0)               return 0; // in progress → top
          return 1;                            // unstarted → middle
        };
        return rank(aLvl, a.maxLevel) - rank(bLvl, b.maxLevel);
      }).map((r) => {
        const lvl = relics[r.id] ?? 0;
        const owned = lvl > 0;
        const tone = RARITY_COLOR[r.rarity];
        return (
          <div
            key={r.id}
            className={`pp-relic-row${owned ? "" : " is-locked"}`}
            style={{
              display: "flex",
              gap: "var(--sp-3)",
              padding: "6px 4px",
              alignItems: "flex-start",
              borderBottom: "1px dashed var(--saddle-300)",
              opacity: owned ? 1 : 0.55,
            }}
          >
            {/* Icon plinth — rarity-tinted backdrop frames the
                artifact glyph like a museum display case. */}
            <div
              style={{
                flex: "0 0 56px",
                width: 56,
                height: 56,
                background: owned ? tone.bg : "var(--parchment-200)",
                border: `2px solid ${owned ? tone.ring : "var(--saddle-300)"}`,
                display: "grid",
                placeItems: "center",
                filter: owned ? "none" : "grayscale(0.7)",
              }}
            >
              <RelicIcon id={r.id} size={44} />
            </div>
            <div style={{ flex: 1, minWidth: 0, color: "var(--ink-900)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13 }}>
                  {r.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 10,
                    color: owned ? tone.ring : "var(--saddle-400)",
                    textTransform: owned ? "none" : "uppercase",
                    letterSpacing: owned ? 0 : "0.06em",
                  }}
                >
                  {owned ? `Lv ${lvl}/${r.maxLevel}` : r.rarity}
                </span>
              </div>
              <div style={{ fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>
                {r.description}
              </div>
            </div>
          </div>
        );
      })}

      {reveal && <RevealModal result={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function summariseWeights(weights: Record<string, number | undefined>): string {
  const total = (Object.values(weights) as Array<number | undefined>).reduce<number>(
    (s, v) => s + (v ?? 0),
    0,
  ) || 1;
  return Object.entries(weights)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([rarity, w]) => `${rarity} ${Math.round((w / total) * 100)}%`)
    .join(" · ");
}

// Spin layout — keep these in lock-step with the CSS calc below.
const STRIP_CARD_W = 96;        // px per card on the strip
const STRIP_LENGTH = 32;        // total cards on the strip
const STRIP_WINNER_INDEX = 26;  // where the rolled relic lands
const STRIP_VIEWPORT_W = 320;   // px wide reveal viewport
const SPIN_DURATION_MS = 2800;
const SPIN_REVEAL_DELAY_MS = SPIN_DURATION_MS + 200;

function RevealModal({ result, onClose }: { result: ChestRollResult; onClose: () => void }) {
  const tone = RARITY_COLOR[result.rarity];
  const def = RELICS_BY_ID[result.relicId];
  const [revealed, setRevealed] = useState(false);

  // Pre-build the strip once per roll. The roll lands on
  // STRIP_WINNER_INDEX; the rest are random catalog entries with a
  // bias toward common-and-uncommon so the strip feels like real
  // chest filler rather than a parade of legendaries.
  const strip = useMemo<RelicDef[]>(() => {
    const winner = RELICS_BY_ID[result.relicId] ?? RELICS[0];
    const filler = RELICS.flatMap((r) => {
      const w = r.rarity === "common" ? 4 : r.rarity === "uncommon" ? 3 : r.rarity === "rare" ? 2 : 1;
      return Array<RelicDef>(w).fill(r);
    });
    const out: RelicDef[] = [];
    for (let i = 0; i < STRIP_LENGTH; i++) {
      if (i === STRIP_WINNER_INDEX) {
        out.push(winner);
      } else {
        out.push(filler[Math.floor(Math.random() * filler.length)]);
      }
    }
    return out;
  }, [result.relicId]);

  useEffect(() => {
    // Decelerating tick schedule — exponentially spaced so the
    // ticks slow down with the strip rather than firing at flat
    // intervals. Cheap "real slot machine" feel.
    const tickTimes = [180, 380, 560, 740, 940, 1180, 1460, 1780, 2150, 2520];
    const tickHandles = tickTimes.map((ms) =>
      window.setTimeout(() => Sfx.play("ui.wood"), ms),
    );
    const t = window.setTimeout(() => {
      setRevealed(true);
      // Reveal SFX — fires synced with the strip landing. Single
      // chip-lay click for everything (clean, casino-y, doesn't
      // step on the tick cadence). Top-tier rolls get a brief
      // coin-drop chaser to mark the rarity without blasting the
      // win.big fanfare.
      Sfx.play("chip.lay");
      if (result.rarity === "legendary" || result.rarity === "epic") {
        window.setTimeout(() => Sfx.play("coin.drop"), 140);
      }
    }, SPIN_REVEAL_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      for (const h of tickHandles) window.clearTimeout(h);
    };
  }, [result.rarity]);

  // Stopping offset: line up the winner card's centre with the
  // viewport's centre. translate-X is negative because the strip
  // moves left to scroll forward.
  const winnerCenter = STRIP_WINNER_INDEX * STRIP_CARD_W + STRIP_CARD_W / 2;
  const viewportCenter = STRIP_VIEWPORT_W / 2;
  // Slight per-roll jitter so the stop position varies a few px —
  // less robotic.
  const jitter = (((result.relicId.length * 17) % 9) - 4);
  const stopX = -(winnerCenter - viewportCenter) + jitter;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Relic chest result: ${result.label}`}
      onClick={revealed ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9_500,
        background: "rgba(26,15,8,0.7)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood"
        style={{
          width: "min(440px, 100%)",
          padding: "var(--sp-5)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
          textAlign: "center",
        }}
      >
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h3)",
            color: "var(--gold-300)",
            letterSpacing: "var(--ls-loose)",
            textShadow: "2px 2px 0 var(--ink-900)",
            marginBottom: "var(--sp-3)",
          }}
        >
          {revealed ? "Relic!" : "Spinning…"}
        </div>

        {/* Spin viewport */}
        <div
          style={{
            position: "relative",
            width: STRIP_VIEWPORT_W,
            maxWidth: "100%",
            height: 96,
            margin: "0 auto var(--sp-3)",
            border: "3px solid var(--ink-900)",
            background: "var(--saddle-200)",
            overflow: "hidden",
            boxShadow: "inset 0 0 16px rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 0,
              animation: `pp-relic-spin ${SPIN_DURATION_MS}ms cubic-bezier(.18, .82, .25, 1) forwards`,
              ["--spin-stop" as string]: `${stopX}px`,
            }}
          >
            {strip.map((r, i) => {
              const t = RARITY_COLOR[r.rarity];
              return (
                <div
                  key={i}
                  style={{
                    flex: `0 0 ${STRIP_CARD_W}px`,
                    height: 96,
                    padding: 6,
                    background: t.bg,
                    borderRight: "2px solid rgba(0,0,0,0.25)",
                    color: t.fg,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  <RelicIcon id={r.id} size={42} />
                  <div style={{ fontSize: 10, marginTop: 4, textAlign: "center", lineHeight: 1.1 }}>
                    {r.label}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Centre marker — pulses while spinning, sets up a
              "land flash" once the spin resolves. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 0,
              borderLeft: "3px solid var(--gold-300)",
              boxShadow: revealed
                ? "0 0 18px rgba(255,200,60,1)"
                : "0 0 8px rgba(255,200,60,0.75)",
              pointerEvents: "none",
              animation: revealed
                ? "pp-relic-marker-land 420ms ease-out"
                : "pp-relic-marker-pulse 0.6s ease-in-out infinite",
              transition: "box-shadow 200ms",
            }}
          />
          {/* Marker arrows pointing at the winning card */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -2,
              left: "50%",
              transform: "translate(-50%, 0)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "10px solid var(--gold-300)",
              filter: "drop-shadow(0 0 4px rgba(255,200,60,0.8))",
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: -2,
              left: "50%",
              transform: "translate(-50%, 0)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "10px solid var(--gold-300)",
              filter: "drop-shadow(0 0 4px rgba(255,200,60,0.8))",
              pointerEvents: "none",
            }}
          />
          {/* Edge fades to suggest infinite strip */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "linear-gradient(90deg, var(--saddle-200), transparent 12%, transparent 88%, var(--saddle-200))",
            }}
          />
          {/* Land flash — bright pulse over the centre when the
              spin resolves, so the eye snaps to the winner. */}
          {revealed && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `calc(50% - ${STRIP_CARD_W / 2}px)`,
                width: STRIP_CARD_W,
                pointerEvents: "none",
                background:
                  "radial-gradient(ellipse at center, rgba(255,220,90,0.55) 0%, rgba(255,220,90,0) 70%)",
                animation: "pp-relic-land-flash 520ms ease-out",
              }}
            />
          )}
        </div>

        {/* Result card — invisible during spin (was opacity 0.25
            before, which leaked the relic name/description through
            the dim overlay so the spin felt rigged). Reserve the
            same vertical space via visibility:hidden so the modal
            doesn't reflow when the card pops in. */}
        <div
          style={{
            background: tone.bg,
            border: `4px solid ${tone.ring}`,
            padding: "var(--sp-4)",
            marginBottom: "var(--sp-3)",
            color: tone.fg,
            boxShadow: revealed ? `0 0 24px ${tone.ring}` : "none",
            visibility: revealed ? "visible" : "hidden",
            transform: revealed ? "scale(1)" : "scale(0.96)",
            transition: "transform 320ms, box-shadow 320ms",
          }}
        >
          <div
            style={{
              width: 84,
              height: 84,
              margin: "0 auto var(--sp-3)",
              background: "rgba(0,0,0,0.18)",
              border: `3px solid ${tone.ring}`,
              display: "grid",
              placeItems: "center",
            }}
          >
            <RelicIcon id={result.relicId} size={68} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.85,
              marginBottom: 4,
            }}
          >
            {result.rarity}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              marginBottom: 6,
              textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
            }}
          >
            {result.label}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 8 }}>
            {def?.description ?? result.description}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 12 }}>
            Lv {result.newLevel} / {result.maxLevel}
            {result.duplicateAtMax && (
              <>
                {" · already maxed"}
                {result.refund > 0 && ` · +${result.refund} ✓ refund`}
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!revealed}
          onClick={onClose}
          style={{ opacity: revealed ? 1 : 0.45 }}
        >
          {revealed ? "Sweet" : "…"}
        </button>
        <style>{`
          @keyframes pp-relic-spin {
            0%   { transform: translateX(0); }
            100% { transform: translateX(var(--spin-stop)); }
          }
          @keyframes pp-relic-marker-pulse {
            0%, 100% { box-shadow: 0 0 8px rgba(255,200,60,0.7); }
            50%      { box-shadow: 0 0 14px rgba(255,200,60,1); }
          }
          @keyframes pp-relic-marker-land {
            0%   { box-shadow: 0 0 24px rgba(255,200,60,1); transform: scaleY(1.08); }
            60%  { box-shadow: 0 0 32px rgba(255,200,60,1); transform: scaleY(1.04); }
            100% { box-shadow: 0 0 18px rgba(255,200,60,1); transform: scaleY(1); }
          }
          @keyframes pp-relic-land-flash {
            0%   { opacity: 0; transform: scale(0.8); }
            40%  { opacity: 1; transform: scale(1.15); }
            100% { opacity: 0; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
