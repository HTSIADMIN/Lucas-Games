"use client";

import { useEffect, useRef, useState } from "react";
import { formatAmount, splitFormatted, tierColor, tierIndex, tierSuffix } from "@/lib/format";

// Smoothly counts the displayed balance from its previous value to
// the new target whenever `value` changes. Used in place of the
// static balance number in the lobby + game header so wins and
// losses tick visibly. Tween length scales loosely with the size of
// the change so a 100¢ tick doesn't drag and a 5M¢ jackpot doesn't
// spam frames.
//
// Tier polish:
//   · The named-tier suffix ("K"/"M"/"B"/"T"/"Qa"/...) renders in
//     a tier-specific color so the player can read their wealth
//     class at a glance — gold for millions, emerald for billions,
//     sapphire for trillions, purple for quadrillions, and on up.
//   · Crossing INTO a new tier fires a one-shot "tier up" pulse:
//     a brief golden text-shadow ring on the whole number, plus a
//     short upward swell. Doesn't fire on a downward tier drop —
//     no need to celebrate losing money.

type Props = {
  value: number;
  /** Optional rendered text wrapper, e.g. " ¢" or "x". */
  suffix?: string;
  /** Min animation duration in ms. */
  minMs?: number;
  /** Max animation duration in ms. */
  maxMs?: number;
  /** Class applied to the rendered span; defaults to none so the
   *  parent can style the text. */
  className?: string;
  /** Inline style passthrough. The component adds a transient
   *  color flash when the balance changes (green up, red down)
   *  but otherwise honors whatever you pass. */
  style?: React.CSSProperties;
  /** When true (default), apply the per-tier color to the
   *  formatted-amount suffix. Set false in places where the parent
   *  is already strongly styled (e.g. inverted dark chips) and the
   *  contrasting color would clash. */
  tierTinted?: boolean;
};

const FLASH_MS = 600;
const TIER_UP_MS = 1200;

export function AnimatedBalance({
  value,
  suffix = "",
  minMs = 350,
  maxMs = 1100,
  className,
  style,
  tierTinted = true,
}: Props) {
  const [display, setDisplay] = useState<number>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [tierUpKey, setTierUpKey] = useState<number>(0);
  const fromRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);
  const prevTierRef = useRef<number>(tierIndex(value));

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const diff = Math.abs(to - from);
    // Scale ~1ms per 1k coins, clamped. Big swings get a longer
    // count, tiny ones snap fast.
    const ms = Math.max(minMs, Math.min(maxMs, 200 + diff / 1000));
    const start = performance.now();
    setFlash(to > from ? "up" : "down");
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    function step(now: number) {
      const t = Math.min(1, (now - start) / ms);
      // Ease-out quad — fast at start, settles into the final value.
      const eased = 1 - (1 - t) * (1 - t);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        fromRef.current = to;
        setDisplay(to);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    const flashT = window.setTimeout(() => setFlash(null), FLASH_MS);
    // Detect tier crossings on the FINAL value (not the in-flight
    // tween). Upward only — losing your last million isn't a
    // celebration. Reset the key to retrigger the CSS animation.
    const nextTier = tierIndex(to);
    if (nextTier > prevTierRef.current) {
      setTierUpKey((k) => k + 1);
    }
    prevTierRef.current = nextTier;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.clearTimeout(flashT);
    };
  }, [value, minMs, maxMs]);

  const flashColor: string | undefined = flash === "up"
    ? "var(--cactus-500)"
    : flash === "down"
    ? "var(--crimson-500)"
    : undefined;

  const formatted = formatAmount(display);
  const { lead, suffix: tierLetter } = splitFormatted(formatted);
  const tierCss = tierColor(tierSuffix(display));

  // Compose the visible amount. When tierTinted is on and we have
  // a tier-letter suffix, color it separately; otherwise render
  // flat. The text-shadow on the parent span animates briefly on a
  // tier-up event via a unique React key.
  return (
    <span
      key={`tier-${tierUpKey}`}
      className={className}
      style={{
        ...style,
        color: flashColor ?? style?.color,
        transition: "color 0.5s ease-out",
        animation: tierUpKey > 0 ? `pp-tier-up ${TIER_UP_MS}ms ease-out` : undefined,
        display: "inline-block",
      }}
    >
      {lead}
      {tierLetter && (
        <span style={{ color: tierTinted ? tierCss : undefined }}>{tierLetter}</span>
      )}
      {suffix}
      <style>{`
        @keyframes pp-tier-up {
          0%   { text-shadow: 0 0 0 rgba(255, 200, 64, 0);   transform: translateY(0); }
          18%  { text-shadow: 0 0 14px rgba(255, 200, 64, 0.95), 2px 2px 0 var(--ink-900); transform: translateY(-3px); }
          60%  { text-shadow: 0 0 8px rgba(255, 200, 64, 0.6),  2px 2px 0 var(--ink-900); transform: translateY(0); }
          100% { text-shadow: 0 0 0 rgba(255, 200, 64, 0); }
        }
      `}</style>
    </span>
  );
}
