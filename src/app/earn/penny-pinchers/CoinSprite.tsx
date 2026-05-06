"use client";

import { useEffect, useState } from "react";
import { COINS, type CoinId, type CoinTrait } from "@/lib/games/penny-pinchers/catalog";

// Single spawned coin in the play area. Renders a chunky pixel-style
// circle with the coin's denomination, a trait-specific aura when
// applicable, and a cosmetic shine-fade as the coin ages so the
// player feels the time pressure even though the click value stays
// constant across the lifetime.

export function CoinSprite({
  coin,
  trait,
  x,
  y,
  spawnedAt,
  lifetimeMs,
  onClick,
}: {
  coin: CoinId;
  trait: CoinTrait | null;
  x: number;
  y: number;
  spawnedAt: number;
  lifetimeMs: number;
  onClick: () => void;
}) {
  const def = COINS[coin];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  const age = now - spawnedAt;
  const lifeFrac = Math.min(1, age / lifetimeMs);
  // Cosmetic decay — coins look duller as they age. Click value
  // is unaffected (no server-coordinated decay yet).
  const tarnish = lifeFrac < 0.5 ? 0 : (lifeFrac - 0.5) / 0.5; // 0 → 1
  const fade = lifeFrac < 0.85 ? 1 : Math.max(0, 1 - (lifeFrac - 0.85) / 0.15);

  // Larger denomination → slightly bigger sprite.
  const baseSize = 36;
  const sizeBoost = { penny: 0, nickel: 4, dime: 6, quarter: 10, half: 14, dollar: 18 }[coin];
  const size = baseSize + sizeBoost;

  // Trait visuals
  const isShiny = trait === "shiny";
  const isSticky = trait === "sticky";
  const auraColor = isShiny ? "rgba(255, 220, 90, 0.85)" : isSticky ? "rgba(120, 220, 255, 0.7)" : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Pick up ${def.label}${trait ? ` (${trait})` : ""}`}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        padding: 0,
        background: `radial-gradient(circle at 35% 30%, ${lighten(def.color, tarnish)} 0%, ${tarnishHex(def.color, tarnish)} 55%, ${def.edge} 100%)`,
        border: `3px solid ${isShiny ? "#f5c842" : def.edge}`,
        borderRadius: "50%",
        color: def.edge,
        fontFamily: "var(--font-display)",
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
        cursor: "pointer",
        opacity: fade,
        transform: "translateZ(0)",
        boxShadow: auraColor
          ? `0 0 0 3px ${auraColor}, 0 0 18px ${auraColor}, 2px 2px 0 rgba(0,0,0,0.4)`
          : "2px 2px 0 rgba(0,0,0,0.4)",
        animation: isShiny
          ? "pp-coin-spawn 240ms var(--ease-out, ease-out), pp-coin-shiny 1.3s ease-in-out infinite"
          : "pp-coin-spawn 240ms var(--ease-out, ease-out)",
      }}
    >
      <span aria-hidden>{coinGlyph(coin)}</span>
      <style>{`
        @keyframes pp-coin-spawn {
          0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes pp-coin-shiny {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255,220,90,0.6), 0 0 14px rgba(255,220,90,0.5), 2px 2px 0 rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 0 0 4px rgba(255,220,90,0.95), 0 0 26px rgba(255,220,90,0.95), 2px 2px 0 rgba(0,0,0,0.4); }
        }
      `}</style>
    </button>
  );
}

function coinGlyph(coin: CoinId): string {
  switch (coin) {
    case "penny":   return "1¢";
    case "nickel":  return "5¢";
    case "dime":    return "10";
    case "quarter": return "25";
    case "half":    return "50";
    case "dollar":  return "$1";
  }
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function lighten(hex: string, tarnish = 0): string {
  // Lighten a hex toward white, optionally pulling back as the coin
  // tarnishes (so the highlight lobe gets smaller as it ages).
  const c = parseHex(hex);
  if (!c) return hex;
  const boost = Math.round(50 * (1 - tarnish));
  return `rgb(${Math.min(255, c.r + boost)}, ${Math.min(255, c.g + boost)}, ${Math.min(255, c.b + boost)})`;
}

function tarnishHex(hex: string, tarnish: number): string {
  // Pull a colour toward 40% gray as it ages — that's the "dirty
  // coin" look without us shipping a separate sprite.
  const c = parseHex(hex);
  if (!c) return hex;
  const target = 102; // ~40% gray
  const blend = Math.max(0, Math.min(1, tarnish));
  const r = Math.round(c.r * (1 - blend * 0.55) + target * blend * 0.55);
  const g = Math.round(c.g * (1 - blend * 0.55) + target * blend * 0.55);
  const b = Math.round(c.b * (1 - blend * 0.55) + target * blend * 0.55);
  return `rgb(${r}, ${g}, ${b})`;
}
