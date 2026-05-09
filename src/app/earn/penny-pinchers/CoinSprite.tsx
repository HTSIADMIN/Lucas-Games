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
  traits,
  pc,
  x,
  y,
  spawnedAt,
  lifetimeMs,
  mergingTo,
  firstTapAt,
  onClick,
}: {
  coin: CoinId;
  /** Every trait on the coin. The disc renders the rarest entry's
   *  aura/halo + a small ✦ count badge if there's more than one. */
  traits: CoinTrait[];
  /** Combined PC value of this coin (post any merges). */
  pc: number;
  x: number;
  y: number;
  spawnedAt: number;
  lifetimeMs: number;
  /** When set, the coin is sliding toward this point to fuse with another. */
  mergingTo?: { x: number; y: number };
  /** Sticky-only: stamped on the first of its required two taps. The
   *  disc skews and locks into a tilted "still stuck" pose until the
   *  second tap dislodges it. */
  firstTapAt?: number;
  onClick: () => void;
}) {
  const renderX = mergingTo?.x ?? x;
  const renderY = mergingTo?.y ?? y;
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

  // Trait visuals — six total. We pick the RAREST trait to drive
  // the marquee aura; multi-trait coins get a small ✦ N badge so
  // the player notices the bonus. Shiny is the marquee one; Ancient
  // reuses Shiny's animation rig with a green-patina palette so it
  // reads "even rarer than gold".
  const isShiny = traits.includes("shiny");
  const isAncient = traits.includes("ancient");
  const isCursed = traits.includes("cursed");
  const isForeign = traits.includes("foreign");
  const isBent = traits.includes("bent");
  const isSticky = traits.includes("sticky");
  const isLightning = traits.includes("lightning");
  const isFrosted = traits.includes("frosted");
  const isLucky = traits.includes("lucky");
  const multiTraitCount = traits.length;

  // Aura color picks the rarest trait the coin is carrying — multi-
  // trait coins still get a single primary aura on the disc itself
  // and the additional halos render in their own conditional blocks
  // below. Sticky was cyan; flipped to bubblegum pink to fit the
  // 'sticky like gum' read.
  const auraColor =
    isAncient   ? "rgba(120, 220, 160, 0.95)" :
    isLightning ? "rgba(255, 230, 90, 1)" :
    isShiny     ? "rgba(255, 220, 90, 0.95)" :
    isLucky     ? "rgba(120, 220, 110, 0.9)" :
    isCursed    ? "rgba(220, 90, 90, 0.95)" :
    isFrosted   ? "rgba(170, 220, 255, 0.9)" :
    isForeign   ? "rgba(140, 200, 255, 0.85)" :
    isBent      ? "rgba(180, 180, 180, 0.65)" :
    isSticky    ? "rgba(255, 130, 200, 0.85)" :
    null;

  // Halo room for big-aura traits.
  const halo =
    isShiny || isAncient || isLightning ? 32 :
    isCursed                            ? 22 :
    isLucky                             ? 22 :
    isFrosted                           ? 20 :
    isForeign                           ? 18 :
    isSticky                            ? 18 :
    0;

  // Bent tilts the disc instead of orbiting it.
  const bentRotate = isBent ? -14 : 0;

  return (
    <button
      type="button"
      // pointerdown fires the moment the mouse / finger lands on
      // the disc — onClick would require the press AND release on
      // the same coin, which fast mouse swipes don't satisfy.
      // preventDefault() on the pointerdown cancels the synthesised
      // click event for the same gesture, so the bare onClick prop
      // only fires for keyboard activation (Enter / Space) where
      // there is no preceding pointer event.
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        onClick();
      }}
      onClick={onClick}
      aria-label={`Pick up ${def.label}${traits.length > 0 ? ` (${traits.join(", ")})` : ""}`}
      style={{
        position: "absolute",
        left: renderX - (size + halo) / 2,
        top: renderY - (size + halo) / 2,
        width: size + halo,
        height: size + halo,
        padding: 0,
        background: "transparent",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        // Suppress mobile tap-flash + drag-text-select on the disc.
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
        opacity: mergingTo ? 0.65 : fade,
        transform: "translateZ(0)",
        // While merging, smooth-slide via CSS transitions instead
        // of the spawn-pop animation so the player tracks each
        // coin physically moving toward its partner.
        transition: mergingTo
          ? `left 280ms cubic-bezier(.55, 0, .45, 1), top 280ms cubic-bezier(.55, 0, .45, 1), opacity 280ms`
          : undefined,
        animation: mergingTo
          ? undefined
          : "pp-coin-spawn 240ms var(--ease-out, ease-out)",
      }}
    >
      {/* Rotating halo — Shiny is gold, Ancient is jade-green. */}
      {(isShiny || isAncient) && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: isShiny
              ? "conic-gradient(from 0deg, rgba(255,250,180,1), rgba(255,200,60,0.0) 30%, rgba(255,250,180,1) 50%, rgba(255,200,60,0.0) 80%, rgba(255,250,180,1))"
              : "conic-gradient(from 0deg, rgba(180,255,210,1), rgba(80,200,140,0.0) 30%, rgba(180,255,210,1) 50%, rgba(80,200,140,0.0) 80%, rgba(180,255,210,1))",
            filter: "blur(7px)",
            animation: `pp-coin-halo-spin ${isAncient ? "3.6s" : "2.4s"} linear infinite`,
          }}
        />
      )}
      {/* Cursed pulse — angry red ring throbbing outward. */}
      {isCursed && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 4,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(220,80,80,0.6) 0%, rgba(220,80,80,0.0) 70%)",
            filter: "blur(4px)",
            animation: "pp-coin-cursed-pulse 0.9s ease-in-out infinite",
          }}
        />
      )}
      {/* Foreign passport-stamp swirl — softer animation than shiny. */}
      {isForeign && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(140,200,255,0.8), rgba(60,140,220,0.0) 50%, rgba(140,200,255,0.8))",
            filter: "blur(5px)",
            animation: "pp-coin-halo-spin 4s linear infinite",
          }}
        />
      )}
      {/* Lightning electric crackle — yellow halo with quick flicker. */}
      {isLightning && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(255,255,180,1), rgba(255,210,40,0.0) 25%, rgba(255,255,180,1) 50%, rgba(255,210,40,0.0) 75%, rgba(255,255,180,1))",
            filter: "blur(6px)",
            animation: "pp-coin-lightning-flicker 0.4s steps(4) infinite",
          }}
        />
      )}
      {/* Frosted icy glow — pale blue, gentle pulse. */}
      {isFrosted && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 2,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(170,220,255,0.7) 0%, rgba(120,200,255,0.0) 70%)",
            filter: "blur(4px)",
            animation: "pp-coin-frosted-pulse 1.6s ease-in-out infinite",
          }}
        />
      )}
      {/* Lucky verdant glow — green halo with a slow rotate. */}
      {isLucky && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 0deg, rgba(140,240,160,0.8), rgba(60,180,90,0.0) 50%, rgba(140,240,160,0.8))",
            filter: "blur(5px)",
            animation: "pp-coin-halo-spin 3.2s linear infinite",
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
          background: isAncient
            ? "radial-gradient(circle at 35% 30%, #b9e5c4 0%, #5fa17a 55%, #2d6240 100%)"
            : isCursed
            ? "radial-gradient(circle at 35% 30%, #e0a0a0 0%, #a04040 55%, #4a0a0a 100%)"
            : isSticky
            ? "radial-gradient(circle at 35% 30%, #ffd0e6 0%, #ff82c8 55%, #b8366f 100%)"
            : `radial-gradient(circle at 35% 30%, ${lighten(def.color, tarnish)} 0%, ${tarnishHex(def.color, tarnish)} 55%, ${def.edge} 100%)`,
          border: `3px solid ${
            isAncient   ? "#3d8a4d" :
            isLightning ? "#c89018" :
            isShiny     ? "#f5c842" :
            isLucky     ? "#2a8a40" :
            isCursed    ? "#7a1a1a" :
            isFrosted   ? "#3d8acc" :
            isForeign   ? "#3d6f9a" :
            isBent      ? "#7a7a7a" :
            isSticky    ? "#d83a8a" :
            def.edge
          }`,
          borderRadius: "50%",
          color: isCursed ? "#fef6e4" : def.edge,
          fontFamily: "var(--font-display)",
          fontSize: Math.round(size * 0.42),
          lineHeight: `${size}px`,
          textAlign: "center",
          // Bent's tilt is now part of the wobble animation; non-bent
          // ambient animations handle their own transforms too.
          transform: undefined,
          boxShadow: auraColor
            ? isShiny || isAncient
              ? `0 0 0 3px ${auraColor}, 0 0 26px ${auraColor}, inset 0 0 14px rgba(255,250,180,0.55), 2px 2px 0 rgba(0,0,0,0.4)`
              : `0 0 0 3px ${auraColor}, 0 0 18px ${auraColor}, 2px 2px 0 rgba(0,0,0,0.4)`
            : "2px 2px 0 rgba(0,0,0,0.4)",
          animation: isSticky && firstTapAt
            ? "pp-coin-sticky-skew 360ms cubic-bezier(.2,.8,.3,1.4) forwards"
            : isShiny || isAncient
            ? "pp-coin-shiny-pulse 1.3s ease-in-out infinite"
            : isCursed
            ? "pp-coin-cursed-shake 2.8s ease-in-out infinite"
            : isForeign
            ? "pp-coin-foreign-rotate 3.2s ease-in-out infinite"
            : isSticky
            ? "pp-coin-sticky-wobble 2.5s ease-in-out infinite"
            : isBent
            ? "pp-coin-bent-tilt 2.2s ease-in-out infinite"
            : undefined,
        }}
      >
        {formatPcLabel(pc)}
      </span>
      {/* Sparkle particles — three asterisks orbiting the disc */}
      {(isShiny || isAncient) && (
        <>
          <span aria-hidden style={sparkleStyle(0,    halo, size, isAncient)}>✦</span>
          <span aria-hidden style={sparkleStyle(0.33, halo, size, isAncient)}>✧</span>
          <span aria-hidden style={sparkleStyle(0.66, halo, size, isAncient)}>✦</span>
        </>
      )}
      {/* Multi-trait badge — small ✦ N pill on the corner so the
          player notices a coin carrying more than one trait. The
          rarer the combo, the bigger the click payout (each trait
          multiplies the payout) so this is the "wow look at that"
          marker for fused or multi-rolled coins. */}
      {multiTraitCount > 1 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: -4,
            top: -4,
            minWidth: 20,
            height: 20,
            padding: "0 5px",
            background: "var(--gold-300)",
            border: "2px solid var(--ink-900)",
            borderRadius: 999,
            fontFamily: "var(--font-display)",
            fontSize: 11,
            color: "var(--ink-900)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            boxShadow: "0 0 10px rgba(255, 200, 60, 0.85)",
            zIndex: 2,
          }}
        >
          ✦{multiTraitCount}
        </span>
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
        @keyframes pp-coin-cursed-pulse {
          0%, 100% { transform: scale(0.85); opacity: 0.55; }
          50%      { transform: scale(1.18); opacity: 0.95; }
        }
        @keyframes pp-coin-cursed-shake {
          0%, 88%, 100% { transform: translateX(0) rotate(0); }
          90% { transform: translateX(-2px) rotate(-3deg); }
          92% { transform: translateX(2px)  rotate(3deg); }
          94% { transform: translateX(-2px) rotate(-3deg); }
          96% { transform: translateX(2px)  rotate(3deg); }
          98% { transform: translateX(-1px) rotate(-1deg); }
        }
        @keyframes pp-coin-foreign-rotate {
          0%, 100% { transform: rotate(-3deg); }
          50%      { transform: rotate(3deg); }
        }
        @keyframes pp-coin-sticky-wobble {
          0%, 80%, 100% { transform: translateX(0) scale(1); }
          85%           { transform: translateX(-1px) scale(1.04); }
          90%           { transform: translateX(1px)  scale(0.98); }
          95%           { transform: translateX(-1px) scale(1.02); }
        }
        @keyframes pp-coin-bent-tilt {
          0%, 100% { transform: rotate(-14deg); }
          50%      { transform: rotate(-9deg); }
        }
        @keyframes pp-coin-lightning-flicker {
          0%, 100% { opacity: 0.85; transform: rotate(0deg); }
          25%      { opacity: 0.4;  transform: rotate(90deg); }
          50%      { opacity: 1;    transform: rotate(180deg); }
          75%      { opacity: 0.55; transform: rotate(270deg); }
        }
        @keyframes pp-coin-frosted-pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.55; }
          50%      { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes pp-coin-sticky-skew {
          0%   { transform: skewX(0)   rotate(0)    translateY(0); }
          40%  { transform: skewX(-18deg) rotate(-6deg) translateY(2px); }
          100% { transform: skewX(-12deg) rotate(-4deg) translateY(1px); }
        }
      `}</style>
    </button>
  );
}

function sparkleStyle(phase: number, halo: number, size: number, ancient = false): CSSProperties {
  const angle = phase * Math.PI * 2;
  const r = size / 2 + halo / 2 - 2;
  const cx = halo / 2 + size / 2 + Math.cos(angle) * r;
  const cy = halo / 2 + size / 2 + Math.sin(angle) * r;
  return {
    position: "absolute",
    left: cx,
    top: cy,
    color: ancient ? "#c8ffd8" : "#fff8c2",
    fontSize: 14,
    fontFamily: "var(--font-display)",
    pointerEvents: "none",
    textShadow: ancient
      ? "0 0 7px rgba(120,220,160,0.95)"
      : "0 0 6px rgba(255,220,90,0.95)",
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
