"use client";

import type { ReactNode } from "react";

// Animated event banner used by each game to announce a temporary
// modifier — Crash engine sputter, Mines lucky pickaxe, Roulette
// hot number, etc. Slides in from above the action area, pulses,
// auto-dismisses or stays as long as the parent passes `active`.

type Tone = "gold" | "crimson" | "cactus" | "sky";

const TONE_BG: Record<Tone, string> = {
  gold:    "linear-gradient(180deg, var(--gold-300), var(--gold-500))",
  crimson: "linear-gradient(180deg, var(--crimson-300), var(--crimson-500))",
  cactus:  "linear-gradient(180deg, var(--cactus-300), var(--cactus-500))",
  sky:     "linear-gradient(180deg, var(--sky-300), var(--sky-500))",
};
const TONE_FG: Record<Tone, string> = {
  gold:    "var(--ink-900)",
  crimson: "var(--parchment-50)",
  cactus:  "var(--parchment-50)",
  sky:     "var(--parchment-50)",
};
const TONE_GLOW: Record<Tone, string> = {
  gold:    "rgba(245, 200, 66, 0.55)",
  crimson: "rgba(224, 90,  60, 0.55)",
  cactus:  "rgba(107, 168, 79, 0.55)",
  sky:     "rgba( 95, 168, 211, 0.55)",
};

export function GameEvent({
  active,
  icon,
  title,
  body,
  tone = "gold",
  trailing,
}: {
  active: boolean;
  /** Short emoji or character for the left badge. */
  icon: string;
  /** Bold one-line headline. */
  title: string;
  /** Sub-line — short instructions or status. */
  body: string;
  tone?: Tone;
  /** Optional element on the right (e.g. a "Use it" button). */
  trailing?: ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      className={`game-event game-event-${tone}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        padding: "var(--sp-2) var(--sp-3)",
        background: TONE_BG[tone],
        color: TONE_FG[tone],
        border: "3px solid var(--ink-900)",
        boxShadow: `0 0 18px ${TONE_GLOW[tone]}, var(--sh-card-rest)`,
        marginBottom: "var(--sp-3)",
        animation: "game-event-slide 0.45s cubic-bezier(.4,1.6,.4,1) both, game-event-pulse 1.8s ease-in-out infinite",
      }}
    >
      <span
        style={{
          fontSize: 26,
          lineHeight: 1,
          textShadow: "1px 1px 0 rgba(0,0,0,0.45)",
          animation: "game-event-icon 1.2s ease-in-out infinite",
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h4)",
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
            lineHeight: 1.05,
            textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-small)",
            opacity: 0.92,
            lineHeight: 1.2,
            marginTop: 2,
          }}
        >
          {body}
        </div>
      </div>
      {trailing && <div style={{ flex: "0 0 auto" }}>{trailing}</div>}
    </div>
  );
}
