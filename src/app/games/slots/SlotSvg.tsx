// External SVG slot symbols + buildings, served from /public/icons.
// We use plain <img> because the SVGs are static art (no React-driven
// fills) and this lets the browser cache them across reels.

import type { CSSProperties } from "react";

export type SlotSymKey = "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF";

const SLOT_SRC: Record<SlotSymKey, string> = {
  BOOT:    "/icons/slots/icon-boot.svg",
  GUN:     "/icons/slots/icon-gun.svg",
  STAR:    "/icons/slots/icon-star.svg",
  GOLD:    "/icons/slots/icon-gold.svg",
  SHERIFF: "/icons/slots/icon-sheriff.svg",
};

const BUILDING_SRC: Record<number, string> = {
  1: "/icons/buildings/icon-tent.svg",
  2: "/icons/buildings/icon-saloon.svg",
  3: "/icons/buildings/icon-town.svg",
  4: "/icons/buildings/icon-frontier.svg",
  5: "/icons/buildings/icon-boomtown.svg",
};

export function SlotSym({ name, size = 56, style }: { name: SlotSymKey; size?: number; style?: CSSProperties }) {
  return (
    <img
      src={SLOT_SRC[name]}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ display: "block", imageRendering: "pixelated", ...style }}
    />
  );
}

export function BuildingSym({ tier, size = 56, style }: { tier: number; size?: number; style?: CSSProperties }) {
  const src = BUILDING_SRC[tier] ?? BUILDING_SRC[1];
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ display: "block", imageRendering: "pixelated", ...style }}
    />
  );
}
