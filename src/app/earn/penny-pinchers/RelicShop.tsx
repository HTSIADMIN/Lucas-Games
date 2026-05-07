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

// Spin layout — keep these in lock-step with the CSS calc below.
const STRIP_CARD_W = 96;        // px per card on the strip
const STRIP_LENGTH = 32;        // total cards on the strip
const STRIP_WINNER_INDEX = 26;  // where the rolled relic lands
const STRIP_VIEWPORT_W = 320;   // px wide reveal viewport
const SPIN_DURATION_MS = 2800;
const SPIN_REVEAL_DELAY_MS = SPIN_DURATION_MS + 200;

function RevealModal({ result, onClose }: { result: RollResult; onClose: () => void }) {
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
    const t = window.setTimeout(() => setRevealed(true), SPIN_REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

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
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      opacity: 0.8,
                    }}
                  >
                    {r.rarity}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, textAlign: "center", lineHeight: 1.1 }}>
                    {r.label}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Centre marker */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 0,
              borderLeft: "3px solid var(--gold-300)",
              boxShadow: "0 0 8px rgba(255,200,60,0.75)",
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
        </div>

        {/* Result card — fades in after the spin lands. */}
        <div
          style={{
            background: tone.bg,
            border: `4px solid ${tone.ring}`,
            padding: "var(--sp-4)",
            marginBottom: "var(--sp-3)",
            color: tone.fg,
            boxShadow: revealed ? `0 0 24px ${tone.ring}` : "none",
            opacity: revealed ? 1 : 0.25,
            transform: revealed ? "scale(1)" : "scale(0.96)",
            transition: "opacity 320ms, transform 320ms, box-shadow 320ms",
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
        `}</style>
      </div>
    </div>
  );
}
