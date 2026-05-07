"use client";

import { useState } from "react";
import * as Sfx from "@/lib/sfx";
import {
  CHESTS,
  RELICS,
  RELICS_BY_ID,
  type ChestTier,
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

type RollResult = {
  tier: ChestTier;
  relicId: RelicId;
  label: string;
  rarity: RelicRarity;
  description: string;
  newLevel: number;
  maxLevel: number;
  duplicateAtMax: boolean;
};

export function RelicShop({
  frugality,
  relics,
  onPurchased,
}: {
  frugality: number;
  relics: Record<string, number>;
  onPurchased: () => void;
}) {
  const [busy, setBusy] = useState<ChestTier | null>(null);
  const [reveal, setReveal] = useState<RollResult | null>(null);

  async function buyChest(tier: ChestTier) {
    if (busy) return;
    const cost = CHESTS[tier].cost;
    if (frugality < cost) return;
    setBusy(tier);
    Sfx.play("pack.open");
    try {
      const r = await fetch("/api/earn/penny-pinchers/relic-chest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (r.ok) {
        const d = (await r.json()) as RollResult;
        setReveal(d);
        Sfx.play(d.rarity === "legendary" || d.rarity === "epic" ? "win.big" : "win.notify");
        onPurchased();
      }
    } catch { /* ignore — sync poll reconciles */ }
    setBusy(null);
  }

  return (
    <div className="stack" style={{ gap: "var(--sp-2)", overflowY: "auto", maxHeight: 480 }}>
      <div
        className="text-mute"
        style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4 }}
      >
        Spend Frugality on chests · keeps relics through Roll-Up
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
      {RELICS.map((r) => {
        const lvl = relics[r.id] ?? 0;
        const owned = lvl > 0;
        const tone = RARITY_COLOR[r.rarity];
        return (
          <div
            key={r.id}
            style={{
              padding: "8px 10px",
              background: owned ? tone.bg : "var(--parchment-200)",
              border: `2px solid ${owned ? tone.ring : "var(--saddle-300)"}`,
              opacity: owned ? 1 : 0.55,
              color: owned ? tone.fg : "var(--ink-900)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 12 }}>
                {r.label}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 11 }}>
                {owned ? `Lv ${lvl}/${r.maxLevel}` : r.rarity.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>
              {r.description}
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

function RevealModal({ result, onClose }: { result: RollResult; onClose: () => void }) {
  const tone = RARITY_COLOR[result.rarity];
  const def = RELICS_BY_ID[result.relicId];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Relic chest result: ${result.label}`}
      onClick={onClose}
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
          width: "min(420px, 100%)",
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
          Relic!
        </div>
        <div
          style={{
            background: tone.bg,
            border: `4px solid ${tone.ring}`,
            padding: "var(--sp-4)",
            marginBottom: "var(--sp-3)",
            color: tone.fg,
            boxShadow: `0 0 24px ${tone.ring}`,
            animation: "pp-relic-reveal 480ms cubic-bezier(.2, 1, .25, 1)",
          }}
        >
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
            {result.duplicateAtMax && " · already maxed"}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Sweet
        </button>
        <style>{`
          @keyframes pp-relic-reveal {
            0%   { transform: scale(0.5) rotate(-8deg); opacity: 0; }
            70%  { transform: scale(1.08) rotate(2deg); opacity: 1; }
            100% { transform: scale(1) rotate(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
