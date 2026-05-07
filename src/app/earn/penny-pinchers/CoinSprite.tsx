"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { COINS, type CoinId, type CoinTrait } from "@/lib/games/penny-pinchers/catalog";

// Single spawned coin in the play area. Renders a chunky pixel-style
// circle with the coin's denomination, a trait-specific aura when
// applicable, and a cosmetic shine-fade as the coin ages so the
// player feels the time pressure even though the click value stays
// constant across the lifetime.

export function CoinSprite({
  coin,
  trait,
  pc,
  x,
  y,
  spawnedAt,
  lifetimeMs,
  onClick,
}: {
  coin: CoinId;
  trait: CoinTrait | null;
  /** Combined PC value of this coin (post any merges). */
  pc: number;
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

  // Size scales with both denom (visual classification) AND
  // accumulated mergedPC so chains of merges grow visibly bigger.
  // log2 keeps the curve gentle — a 32¢ merged coin is only
  // ~2x the area of a fresh penny.
  const baseSize = 36;
  const sizeBoost = { penny: 0, nickel: 4, dime: 6, quarter: 10, half: 14, dollar: 18 }[coin];
  const mergeBoost = Math.min(48, Math.round(Math.log2(Math.max(1, pc)) * 5));
  const size = baseSize + sizeBoost + mergeBoost;

  // Trait visuals
  const isShiny = trait === "shiny";
  const isSticky = trait === "sticky";
  const auraColor = isShiny ? "rgba(255, 220, 90, 0.95)" : isSticky ? "rgba(120, 220, 255, 0.75)" : null;
  // Box bigger for shiny so the rotating halo + sparkle particles
  // have room to live outside the coin disc itself.
  const halo = isShiny ? 28 : isSticky ? 18 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Pick up ${def.label}${trait ? ` (${trait})` : ""}`}
      style={{
        position: "absolute",
        left: x - (size + halo) / 2,
        top: y - (size + halo) / 2,
        width: size + halo,
        height: size + halo,
        padding: 0,
        background: "transparent",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        opacity: fade,
        transform: "translateZ(0)",
        animation: "pp-coin-spawn 240ms var(--ease-out, ease-out)",
      }}
    >
      {/* Shiny halo — slow rotating conic gradient behind the coin disc */}
      {isShiny && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(255,250,180,0.95), rgba(255,200,60,0.0) 30%, rgba(255,250,180,0.95) 50%, rgba(255,200,60,0.0) 80%, rgba(255,250,180,0.95))",
            filter: "blur(6px)",
            animation: "pp-coin-halo-spin 2.4s linear infinite",
          }}
        />
      )}
      {/* Coin disc */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: halo / 2,
          top: halo / 2,
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 30%, ${lighten(def.color, tarnish)} 0%, ${tarnishHex(def.color, tarnish)} 55%, ${def.edge} 100%)`,
          border: `3px solid ${isShiny ? "#f5c842" : def.edge}`,
          borderRadius: "50%",
          color: def.edge,
          fontFamily: "var(--font-display)",
          fontSize: Math.round(size * 0.42),
          lineHeight: `${size}px`,
          textAlign: "center",
          boxShadow: auraColor
            ? isShiny
              ? `0 0 0 3px ${auraColor}, 0 0 22px ${auraColor}, inset 0 0 12px rgba(255,250,180,0.55), 2px 2px 0 rgba(0,0,0,0.4)`
              : `0 0 0 3px ${auraColor}, 0 0 18px ${auraColor}, 2px 2px 0 rgba(0,0,0,0.4)`
            : "2px 2px 0 rgba(0,0,0,0.4)",
          animation: isShiny ? "pp-coin-shiny-pulse 1.3s ease-in-out infinite" : undefined,
        }}
      >
        {formatPcLabel(pc)}
      </span>
      {/* Sparkle particles — three asterisks orbiting the disc */}
      {isShiny && (
        <>
          <span aria-hidden style={sparkleStyle(0,    halo, size)}>✦</span>
          <span aria-hidden style={sparkleStyle(0.33, halo, size)}>✧</span>
          <span aria-hidden style={sparkleStyle(0.66, halo, size)}>✦</span>
        </>
      )}
      <style>{`
        @keyframes pp-coin-spawn {
          0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes pp-coin-shiny-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @keyframes pp-coin-halo-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pp-coin-sparkle {
          0%, 100% { opacity: 0.2; transform: translate(-50%, -50%) scale(0.7) rotate(0deg); }
          50%      { opacity: 1;   transform: translate(-50%, -50%) scale(1.2) rotate(180deg); }
        }
      `}</style>
    </button>
  );
}

function sparkleStyle(phase: number, halo: number, size: number): CSSProperties {
  // Position three sparkles at evenly-spaced angles around the disc
  // edge; each gets a different animation-delay so they twinkle out
  // of phase. Halo + 4px gives just enough breathing room outside
  // the gold ring for the asterisks to read clearly.
  const angle = phase * Math.PI * 2;
  const r = size / 2 + halo / 2 - 2;
  const cx = halo / 2 + size / 2 + Math.cos(angle) * r;
  const cy = halo / 2 + size / 2 + Math.sin(angle) * r;
  return {
    position: "absolute",
    left: cx,
    top: cy,
    color: "#fff8c2",
    fontSize: 14,
    fontFamily: "var(--font-display)",
    pointerEvents: "none",
    textShadow: "0 0 6px rgba(255,220,90,0.95)",
    transform: "translate(-50%, -50%)",
    animation: `pp-coin-sparkle 1.3s ease-in-out ${phase * 1.3}s infinite`,
  };
}

function formatPcLabel(pc: number): string {
  // Compact label so big merged values still fit in the disc.
  if (pc >= 1_000_000) return `${(pc / 1_000_000).toFixed(1)}M`;
  if (pc >= 10_000) return `${(pc / 1000).toFixed(0)}k`;
  if (pc >= 1_000) return `${(pc / 1000).toFixed(1)}k`;
  if (pc >= 100) return `${pc}`;
  return `${pc}¢`;
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
