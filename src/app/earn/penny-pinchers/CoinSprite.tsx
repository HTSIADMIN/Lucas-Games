"use client";

import { useEffect, useState } from "react";
import { COINS, type CoinId } from "@/lib/games/penny-pinchers/catalog";

// Single spawned coin in the play area. Renders a chunky pixel-style
// circle with the coin's first letter, fades + drifts as it ages, and
// fires `onClick` on tap.

export function CoinSprite({
  coin,
  x,
  y,
  spawnedAt,
  lifetimeMs,
  onClick,
}: {
  coin: CoinId;
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
  const fade = lifeFrac < 0.7 ? 1 : Math.max(0, 1 - (lifeFrac - 0.7) / 0.3);

  // Larger denomination → slightly bigger sprite.
  const baseSize = 36;
  const sizeBoost = { penny: 0, nickel: 4, dime: 6, quarter: 10, half: 14, dollar: 18 }[coin];
  const size = baseSize + sizeBoost;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Pick up ${def.label}`}
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        padding: 0,
        background: `radial-gradient(circle at 35% 30%, ${lighten(def.color)} 0%, ${def.color} 55%, ${def.edge} 100%)`,
        border: `3px solid ${def.edge}`,
        borderRadius: "50%",
        color: def.edge,
        fontFamily: "var(--font-display)",
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
        cursor: "pointer",
        opacity: fade,
        transform: "translateZ(0)",
        boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
        animation: "pp-coin-spawn 240ms var(--ease-out, ease-out)",
      }}
    >
      <span aria-hidden>{coinGlyph(coin)}</span>
      <style>{`
        @keyframes pp-coin-spawn {
          0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
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

function lighten(hex: string): string {
  // Quick #rrggbb lighten by ~30 toward white. Cheap, no library.
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 50);
  const g = Math.min(255, ((n >> 8) & 0xff) + 50);
  const b = Math.min(255, (n & 0xff) + 50);
  return `rgb(${r}, ${g}, ${b})`;
}
