"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Rank, Suit } from "@/lib/games/cards";
import { DECK_PALETTES } from "@/lib/shop/catalog";

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

// Card-deck palette context — set once per page, read by every PlayingCard.
const DeckCtx = createContext<string>("classic");

export function DeckProvider({ palette, children }: { palette: string; children: ReactNode }) {
  return <DeckCtx.Provider value={palette}>{children}</DeckCtx.Provider>;
}

export type PlayingCardProps = {
  rank?: Rank | "?";
  suit?: Suit | "?";
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  /** Override the palette from the surrounding DeckProvider. */
  palette?: string;
};

const SIZES = {
  sm: { w: 56, h: 96, fs: 18, glyph: 22 },
  md: { w: 84, h: 134, fs: 24, glyph: 32 },
  lg: { w: 110, h: 174, fs: 30, glyph: 44 },
};

export function PlayingCard({ rank, suit, faceDown, size = "md", palette }: PlayingCardProps) {
  const s = SIZES[size];
  const ctxPalette = useContext(DeckCtx);
  const paletteKey = palette ?? ctxPalette;
  const colors = DECK_PALETTES[paletteKey] ?? DECK_PALETTES.classic;

  // Resolve optional palette overrides with sensible defaults so
  // the legacy decks render unchanged.
  const borderColor = colors.border ?? "var(--ink-900)";
  const faceFill = colors.face ?? "var(--parchment-50)";
  const animClass = colors.animated ? `lg-deck-anim-${colors.animated}` : undefined;

  if (faceDown || rank === "?" || suit === "?" || !rank || !suit) {
    // Animated palettes set their own backgroundImage via .lg-deck-
    // anim-* CSS so the keyframes can drive position/filter; static
    // overrides use palette.backImage; everything else falls back to
    // the original 45° stripe.
    const inlineBackImage = animClass
      ? undefined
      : colors.backImage
      ?? `repeating-linear-gradient(45deg, ${colors.back} 0 6px, var(--ink-900) 6px 12px)`;
    return (
      <div
        className={animClass}
        style={{
          width: s.w,
          height: s.h,
          background: colors.back,
          border: `3px solid ${borderColor}`,
          boxShadow: "var(--sh-card-rest), var(--bevel-light)",
          backgroundImage: inlineBackImage,
          flexShrink: 0,
        }}
      />
    );
  }

  const glyph = SUIT_GLYPH[suit as Suit];
  const color = colors[suit as Suit];
  // Neon-style decks light the card edge in the suit colour; the
  // matching neon glow uses that same colour so the trim reads as
  // a strip-light on the rim. Falls back to the deck's `border`
  // for every other deck.
  const faceBorder = colors.borderMatchesSuit ? color : borderColor;
  const faceBoxShadow = colors.borderMatchesSuit
    ? `var(--sh-card-rest), 0 0 10px ${color}, inset 0 0 6px ${color}66`
    : "var(--sh-card-rest)";
  return (
    <div
      style={{
        width: s.w,
        height: s.h,
        background: faceFill,
        border: `3px solid ${faceBorder}`,
        boxShadow: faceBoxShadow,
        position: "relative",
        flexShrink: 0,
        fontFamily: "var(--font-display)",
        color,
        padding: "4px 6px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: s.fs, lineHeight: 1 }}>
        {rank}
        <div style={{ fontSize: s.glyph, lineHeight: 1 }}>{glyph}</div>
      </div>
      <div style={{ fontSize: s.fs, lineHeight: 1, alignSelf: "flex-end", transform: "rotate(180deg)" }}>
        {rank}
        <div style={{ fontSize: s.glyph, lineHeight: 1 }}>{glyph}</div>
      </div>
    </div>
  );
}
