"use client";

import type { Rank, Suit } from "@/lib/games/cards";

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const SUIT_VAR: Record<Suit, string> = {
  spades: "var(--suit-spades)",
  hearts: "var(--suit-hearts)",
  diamonds: "var(--suit-diamonds)",
  clubs: "var(--suit-clubs)",
};

export type PlayingCardProps = {
  rank?: Rank | "?";
  suit?: Suit | "?";
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
};

const SIZES = {
  sm: { w: 56, h: 84, fs: 18, glyph: 22 },
  md: { w: 84, h: 120, fs: 24, glyph: 32 },
  lg: { w: 110, h: 158, fs: 30, glyph: 44 },
};

export function PlayingCard({ rank, suit, faceDown, size = "md" }: PlayingCardProps) {
  const s = SIZES[size];

  if (faceDown || rank === "?" || suit === "?" || !rank || !suit) {
    return (
      <div
        style={{
          width: s.w,
          height: s.h,
          background: "var(--saddle-500)",
          border: "3px solid var(--ink-900)",
          boxShadow: "var(--sh-card-rest), var(--bevel-light)",
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--saddle-400) 0 6px, var(--saddle-600) 6px 12px)",
          flexShrink: 0,
        }}
      />
    );
  }

  const glyph = SUIT_GLYPH[suit as Suit];
  const color = SUIT_VAR[suit as Suit];
  return (
    <div
      style={{
        width: s.w,
        height: s.h,
        background: "var(--parchment-50)",
        border: "3px solid var(--ink-900)",
        boxShadow: "var(--sh-card-rest)",
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
