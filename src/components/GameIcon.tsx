// Custom pixel-art icons. 16x16 grid, integer coordinates, shape-rendering=crispEdges
// so they stay crisp at any scale. Each icon is hand-laid as an SVG.

import type { CSSProperties } from "react";

export type IconName =
  | "slot.boot" | "slot.gun" | "slot.star" | "slot.gold" | "slot.sheriff"
  | "mines.bomb" | "mines.gem"
  | "plinko.chip"
  | "react.fire" | "react.skull" | "react.party" | "react.clown" | "react.money" | "react.cowboy"
  | "ui.tip" | "ui.crown" | "ui.dot" | "ui.chat" | "ui.close"
  | "coin.heads" | "coin.tails"
  | "lobby.coinflip" | "lobby.coinflip_duel" | "lobby.dice" | "lobby.slots"
  | "lobby.blackjack" | "lobby.roulette" | "lobby.mines" | "lobby.plinko"
  | "lobby.crash" | "lobby.poker" | "lobby.daily_spin" | "lobby.crossy_road"
  | "lobby.flappy" | "lobby.monopoly";

// Re-export under a clearer alias for callers that don't want to use "IconName".
export type GameIconName = IconName;

// Reusable color tokens (literal hex for SVG compatibility)
const C = {
  ink:        "#1a0f08",
  inkSoft:    "#3d2418",
  saddleD:    "#4a2818",
  saddle:     "#6b3f24",
  saddleM:    "#a87545",
  saddleL:    "#d4a574",
  parchL:     "#fef6e4",
  parchM:     "#fbe9c4",
  parchD:     "#e8c468",
  goldL:      "#ffe9a8",
  gold:       "#f5c842",
  goldD:      "#c8941d",
  goldDD:     "#7a5510",
  neonGold:   "#ffd84d",
  crimson:    "#e05a3c",
  crimsonD:   "#8b3a3a",
  crimsonDD:  "#4a1a1a",
  neonCrim:   "#ff5544",
  cactus:     "#6ba84f",
  cactusD:    "#3d6b2e",
  cactusL:    "#b8d99a",
  sky:        "#5fa8d3",
  skyD:       "#2c6a8e",
  skyL:       "#c9e4f2",
  white:      "#ffffff",
  bone:       "#f4ecdc",
  shadow:     "#2a1810",
};

type Px = [x: number, y: number, w: number, h: number, color: string];

const ICONS: Partial<Record<IconName, Px[]>> = {
  // ============ SLOTS ============
  // BOOT — brown cowboy boot
  "slot.boot": [
    [6, 2, 4, 1, C.saddle],
    [5, 3, 5, 1, C.saddle],
    [5, 4, 5, 1, C.saddle],
    [5, 5, 5, 1, C.saddle],
    [5, 6, 5, 1, C.saddle],
    [5, 7, 5, 1, C.saddle],
    [5, 8, 5, 1, C.saddle],
    [3, 9, 9, 1, C.saddle],
    [3, 10, 10, 1, C.saddle],
    [3, 11, 10, 1, C.saddleD],
    [3, 12, 10, 1, C.saddleD],
    // sole
    [2, 13, 11, 1, C.ink],
    // outline highlights
    [6, 3, 1, 1, C.saddleL],
    [6, 4, 1, 1, C.saddleL],
    [6, 5, 1, 1, C.saddleL],
    // spur
    [12, 11, 2, 1, C.gold],
    [12, 12, 2, 1, C.goldD],
  ],

  // GUN — black six-shooter
  "slot.gun": [
    // barrel
    [2, 6, 8, 2, C.ink],
    [2, 8, 1, 1, C.inkSoft],
    [9, 8, 1, 1, C.inkSoft],
    // cylinder
    [7, 5, 4, 4, C.ink],
    [8, 6, 1, 1, C.saddleM],
    [9, 7, 1, 1, C.saddleM],
    // grip
    [9, 8, 3, 7, C.saddleD],
    [10, 8, 1, 6, C.saddle],
    // trigger guard
    [8, 9, 2, 1, C.ink],
    [8, 10, 1, 1, C.ink],
    [9, 10, 1, 1, C.ink],
    // muzzle highlight
    [2, 7, 1, 1, C.parchL],
  ],

  // STAR — sheriff gold star (5-point)
  "slot.star": [
    [7, 1, 2, 2, C.neonGold],
    [6, 3, 4, 1, C.gold],
    [1, 4, 14, 1, C.gold],
    [2, 5, 12, 1, C.gold],
    [3, 6, 10, 2, C.gold],
    [4, 8, 8, 2, C.gold],
    [3, 10, 3, 2, C.gold],
    [10, 10, 3, 2, C.gold],
    [2, 12, 3, 2, C.goldD],
    [11, 12, 3, 2, C.goldD],
    // shadow on right side
    [9, 5, 3, 2, C.goldD],
    [9, 7, 3, 2, C.goldD],
    [10, 9, 2, 1, C.goldD],
    // highlight
    [4, 5, 3, 1, C.neonGold],
    [5, 6, 2, 1, C.neonGold],
  ],

  // GOLD — coin stack
  "slot.gold": [
    // bottom coin
    [2, 11, 12, 3, C.goldDD],
    [3, 10, 10, 1, C.goldD],
    [3, 14, 10, 1, C.goldDD],
    // middle coin
    [3, 8, 10, 2, C.goldD],
    [4, 7, 8, 1, C.gold],
    // top coin
    [4, 5, 8, 2, C.gold],
    [5, 4, 6, 1, C.neonGold],
    [5, 7, 6, 1, C.goldD],
    // dollar sign
    [7, 5, 2, 1, C.goldDD],
    [7, 6, 2, 1, C.goldDD],
    [8, 6, 1, 1, C.gold],
    // shine
    [5, 5, 1, 1, C.parchL],
  ],

  // SHERIFF — cowboy hat
  "slot.sheriff": [
    // crown top
    [5, 3, 6, 1, C.crimsonD],
    [4, 4, 8, 3, C.crimson],
    [4, 4, 1, 3, C.crimsonDD],
    [11, 4, 1, 3, C.crimsonDD],
    // band
    [4, 7, 8, 1, C.crimsonDD],
    // brim
    [1, 8, 14, 2, C.crimson],
    [1, 9, 14, 1, C.crimsonD],
    [1, 10, 14, 1, C.crimsonDD],
    // sheriff star center band
    [7, 7, 2, 1, C.gold],
    // shine
    [5, 4, 2, 1, C.neonCrim],
  ],

  // ============ MINES ============
  // BOMB — round black with fuse and spark
  "mines.bomb": [
    [4, 6, 8, 7, C.ink],
    [3, 7, 10, 5, C.ink],
    [5, 5, 6, 1, C.ink],
    // shine
    [5, 7, 2, 1, C.crimson],
    [5, 8, 1, 1, C.parchL],
    // fuse
    [7, 3, 1, 2, C.saddle],
    [8, 2, 1, 2, C.saddle],
    // spark
    [7, 1, 1, 1, C.neonGold],
    [8, 0, 1, 1, C.crimson],
    [9, 1, 1, 1, C.neonGold],
    [8, 1, 1, 1, C.gold],
    // base
    [4, 13, 8, 1, C.shadow],
  ],

  // GEM — green diamond
  "mines.gem": [
    [6, 2, 4, 1, C.cactusL],
    [5, 3, 6, 1, C.cactus],
    [4, 4, 8, 1, C.cactus],
    [3, 5, 10, 1, C.cactus],
    [2, 6, 12, 1, C.cactus],
    [3, 7, 10, 1, C.cactusD],
    [4, 8, 8, 1, C.cactusD],
    [5, 9, 6, 1, C.cactusD],
    [6, 10, 4, 1, C.cactusD],
    [7, 11, 2, 1, C.cactusD],
    // facets / shine
    [6, 3, 2, 1, C.white],
    [5, 4, 2, 1, C.cactusL],
    [4, 5, 2, 1, C.cactusL],
  ],

  // ============ PLINKO ============
  // CHIP — gold poker chip
  "plinko.chip": [
    [5, 2, 6, 1, C.goldD],
    [3, 3, 10, 1, C.goldD],
    [2, 4, 12, 1, C.gold],
    [2, 5, 12, 1, C.gold],
    [2, 6, 12, 4, C.goldD],
    [2, 10, 12, 1, C.goldD],
    [2, 11, 12, 1, C.gold],
    [3, 12, 10, 1, C.goldD],
    [5, 13, 6, 1, C.goldDD],
    // edge ticks
    [7, 2, 2, 1, C.ink],
    [7, 13, 2, 1, C.ink],
    [2, 7, 1, 2, C.ink],
    [13, 7, 1, 2, C.ink],
    // center ring
    [6, 6, 4, 1, C.goldDD],
    [5, 7, 6, 2, C.goldDD],
    [6, 9, 4, 1, C.goldDD],
    [7, 7, 2, 2, C.gold],
  ],

  // ============ REACTIONS ============
  // FIRE — flame
  "react.fire": [
    [7, 2, 2, 1, C.neonGold],
    [6, 3, 4, 1, C.gold],
    [5, 4, 6, 1, C.neonGold],
    [4, 5, 8, 1, C.crimson],
    [3, 6, 10, 1, C.crimson],
    [3, 7, 10, 2, C.neonCrim],
    [3, 9, 10, 2, C.crimson],
    [4, 11, 8, 2, C.crimsonD],
    [5, 13, 6, 1, C.crimsonDD],
    // inner brightness
    [6, 7, 4, 2, C.gold],
    [7, 9, 2, 1, C.neonGold],
  ],

  // SKULL
  "react.skull": [
    // top
    [5, 2, 6, 1, C.bone],
    [4, 3, 8, 1, C.bone],
    [3, 4, 10, 5, C.bone],
    [3, 9, 10, 1, C.bone],
    [4, 10, 8, 1, C.bone],
    // jaw
    [5, 11, 1, 2, C.bone],
    [7, 11, 1, 2, C.bone],
    [9, 11, 1, 2, C.bone],
    [11, 11, 1, 2, C.bone],
    // eyes
    [5, 6, 2, 2, C.ink],
    [9, 6, 2, 2, C.ink],
    // nose
    [7, 8, 2, 1, C.ink],
    // crack shadow
    [3, 4, 1, 5, C.parchD],
  ],

  // PARTY — confetti burst
  "react.party": [
    // cone
    [6, 8, 1, 1, C.gold],
    [5, 9, 3, 1, C.goldD],
    [4, 10, 5, 1, C.goldDD],
    [4, 11, 5, 1, C.gold],
    [5, 12, 3, 1, C.goldD],
    // confetti
    [10, 2, 2, 2, C.crimson],
    [13, 4, 2, 2, C.cactus],
    [11, 6, 2, 2, C.sky],
    [13, 8, 2, 2, C.gold],
    [12, 11, 2, 2, C.crimson],
    [10, 13, 2, 2, C.cactus],
    [2, 12, 1, 1, C.sky],
    [1, 9, 1, 1, C.gold],
    // streamer
    [8, 7, 1, 1, C.crimson],
    [9, 6, 1, 1, C.gold],
    [10, 5, 1, 1, C.cactus],
  ],

  // CLOWN — red ball with face
  "react.clown": [
    [4, 3, 8, 8, C.crimson],
    [5, 2, 6, 1, C.crimson],
    [3, 4, 1, 6, C.crimson],
    [12, 4, 1, 6, C.crimson],
    [5, 11, 6, 1, C.crimson],
    // hair tufts
    [2, 4, 2, 2, C.gold],
    [12, 4, 2, 2, C.gold],
    // eyes
    [6, 5, 1, 2, C.ink],
    [9, 5, 1, 2, C.ink],
    // nose
    [7, 7, 2, 2, C.neonGold],
    [7, 7, 1, 1, C.gold],
    // mouth
    [6, 9, 4, 1, C.ink],
    [5, 8, 1, 1, C.ink],
    [10, 8, 1, 1, C.ink],
    // shine
    [4, 4, 1, 1, C.neonCrim],
  ],

  // MONEY — bag with $
  "react.money": [
    [5, 1, 6, 2, C.cactusD],
    [6, 0, 4, 1, C.cactusD],
    [4, 3, 8, 1, C.cactus],
    [3, 4, 10, 1, C.cactus],
    [2, 5, 12, 8, C.cactusD],
    [3, 13, 10, 1, C.cactusD],
    // dollar sign
    [7, 6, 2, 1, C.gold],
    [6, 7, 1, 2, C.gold],
    [7, 8, 2, 1, C.gold],
    [9, 9, 1, 2, C.gold],
    [7, 10, 2, 1, C.gold],
    [7, 7, 1, 1, C.neonGold],
    // tie at top
    [6, 2, 4, 1, C.cactus],
    // shine
    [4, 5, 1, 1, C.cactusL],
  ],

  // COWBOY HAT — brown
  "react.cowboy": [
    [5, 4, 6, 1, C.saddleD],
    [4, 5, 8, 3, C.saddle],
    [4, 5, 1, 3, C.saddleD],
    [11, 5, 1, 3, C.saddleD],
    // band
    [4, 8, 8, 1, C.ink],
    // brim
    [1, 9, 14, 2, C.saddle],
    [1, 10, 14, 1, C.saddleD],
    [1, 11, 14, 1, C.shadow],
    // accent
    [7, 8, 2, 1, C.gold],
    [5, 5, 2, 1, C.saddleM],
  ],

  // ============ UI ============
  // TIP — wrapped gift box
  "ui.tip": [
    // ribbon top
    [7, 2, 2, 2, C.crimson],
    [6, 3, 4, 1, C.crimsonD],
    [9, 3, 4, 1, C.crimsonD],
    // box
    [3, 5, 10, 1, C.gold],
    [2, 6, 12, 7, C.gold],
    [2, 6, 1, 7, C.goldD],
    [13, 6, 1, 7, C.goldD],
    [2, 12, 12, 1, C.goldD],
    // ribbon vertical + horizontal
    [7, 5, 2, 8, C.crimson],
    [2, 8, 12, 2, C.crimson],
    [7, 8, 2, 2, C.crimsonD],
    // shine
    [4, 6, 1, 1, C.neonGold],
  ],

  // CROWN — gold
  "ui.crown": [
    // points
    [3, 4, 1, 4, C.gold],
    [4, 5, 1, 3, C.gold],
    [7, 2, 2, 2, C.neonGold],
    [11, 5, 1, 3, C.gold],
    [12, 4, 1, 4, C.gold],
    // band
    [3, 8, 10, 4, C.goldD],
    [3, 12, 10, 1, C.goldDD],
    // jewel
    [7, 9, 2, 2, C.crimson],
    // points jewels
    [3, 7, 1, 1, C.crimson],
    [12, 7, 1, 1, C.crimson],
    [7, 4, 2, 1, C.crimson],
    // shine
    [4, 8, 1, 1, C.neonGold],
  ],

  // DOT — pulsing green
  "ui.dot": [
    [6, 6, 4, 4, C.cactus],
    [6, 5, 4, 1, C.cactus],
    [5, 6, 1, 4, C.cactus],
    [10, 6, 1, 4, C.cactus],
    [6, 10, 4, 1, C.cactus],
    [7, 7, 2, 2, C.cactusL],
  ],

  // CHAT — speech bubble
  "ui.chat": [
    [3, 3, 10, 1, C.ink],
    [2, 4, 12, 6, C.ink],
    [3, 10, 10, 1, C.ink],
    [4, 11, 4, 1, C.ink],
    [4, 12, 2, 1, C.ink],
    // bubble interior
    [3, 4, 10, 5, C.parchM],
    // dots inside
    [5, 6, 1, 1, C.ink],
    [7, 6, 1, 1, C.ink],
    [9, 6, 1, 1, C.ink],
    // tail interior
    [4, 11, 3, 1, C.parchM],
  ],

  // CLOSE — X
  "ui.close": [
    [4, 4, 1, 1, C.ink],
    [11, 4, 1, 1, C.ink],
    [5, 5, 1, 1, C.ink],
    [10, 5, 1, 1, C.ink],
    [6, 6, 1, 1, C.ink],
    [9, 6, 1, 1, C.ink],
    [7, 7, 2, 2, C.ink],
    [6, 9, 1, 1, C.ink],
    [9, 9, 1, 1, C.ink],
    [5, 10, 1, 1, C.ink],
    [10, 10, 1, 1, C.ink],
    [4, 11, 1, 1, C.ink],
    [11, 11, 1, 1, C.ink],
  ],

  // ============ COIN HEADS / TAILS ============
  "coin.heads": [
    // gold coin
    [5, 2, 6, 1, C.goldD],
    [3, 3, 10, 1, C.goldD],
    [2, 4, 12, 8, C.gold],
    [3, 12, 10, 1, C.goldD],
    [5, 13, 6, 1, C.goldDD],
    [2, 4, 1, 8, C.goldD],
    [13, 4, 1, 8, C.goldD],
    // letter H
    [5, 6, 1, 5, C.ink],
    [10, 6, 1, 5, C.ink],
    [6, 8, 4, 1, C.ink],
    // shine
    [3, 5, 2, 1, C.neonGold],
    [4, 4, 1, 1, C.neonGold],
  ],
  "coin.tails": [
    [5, 2, 6, 1, C.goldD],
    [3, 3, 10, 1, C.goldD],
    [2, 4, 12, 8, C.gold],
    [3, 12, 10, 1, C.goldD],
    [5, 13, 6, 1, C.goldDD],
    [2, 4, 1, 8, C.goldD],
    [13, 4, 1, 8, C.goldD],
    // letter T
    [5, 6, 6, 1, C.ink],
    [7, 7, 2, 4, C.ink],
    // shine
    [3, 5, 2, 1, C.neonGold],
  ],

};

// =============================================================
// LOBBY TILE ART — 128×128 grid
// High-detail dioramas for the marquee games. Each scene targets ~80–150
// rectangles. Coordinates are in 4-pixel units of the 128 grid for
// readability — most rects are multiples of 4px wide/tall.
// =============================================================
const LOBBY_ICONS_128: Partial<Record<IconName, Px[]>> = {

  // ----- Coin Flip — gold coin with embossed $ + motion arcs -----
  "lobby.coinflip": [
    // Drop shadow (ellipse-ish under the coin)
    [38, 110, 52, 6, C.shadow],
    [44, 116, 40, 4, C.shadow],
    // Coin disc — chunky pixel circle, ~96 wide
    // top staircase
    [52, 16, 24,  4, C.goldDD],
    [40, 20, 48,  4, C.goldDD],
    [32, 24, 64,  4, C.goldDD],
    [28, 28, 72,  4, C.goldDD],
    [24, 32, 80,  4, C.goldDD],
    [20, 36, 88,  4, C.goldDD],
    [16, 40, 96, 48, C.goldDD],
    [20, 88, 88,  4, C.goldDD],
    [24, 92, 80,  4, C.goldDD],
    [28, 96, 72,  4, C.goldDD],
    [32,100, 64,  4, C.goldDD],
    [40,104, 48,  4, C.goldDD],
    [52,108, 24,  4, C.goldDD],
    // inner gold body (one px inset from goldDD)
    [44, 20, 40,  4, C.goldD],
    [36, 24, 56,  4, C.goldD],
    [32, 28, 64,  4, C.goldD],
    [28, 32, 72,  4, C.goldD],
    [24, 36, 80,  4, C.goldD],
    [20, 40, 88, 48, C.goldD],
    [24, 88, 80,  4, C.goldD],
    [28, 92, 72,  4, C.goldD],
    [32, 96, 64,  4, C.goldD],
    [36,100, 56,  4, C.goldD],
    [44,104, 40,  4, C.goldD],
    // brighter gold core (2px inset)
    [48, 24, 32,  4, C.gold],
    [40, 28, 48,  4, C.gold],
    [36, 32, 56,  4, C.gold],
    [32, 36, 64,  4, C.gold],
    [28, 40, 72,  4, C.gold],
    [24, 44, 80, 40, C.gold],
    [28, 84, 72,  4, C.gold],
    [32, 88, 64,  4, C.gold],
    [36, 92, 56,  4, C.gold],
    [40, 96, 48,  4, C.gold],
    [48,100, 32,  4, C.gold],
    // top-left crescent shine (lighter gold + neon)
    [40, 28, 12,  4, C.goldL],
    [32, 32, 16,  4, C.goldL],
    [28, 36, 20,  4, C.goldL],
    [24, 40, 16,  4, C.goldL],
    [20, 44, 16, 12, C.goldL],
    [24, 56, 12,  4, C.goldL],
    [28, 36,  8,  4, C.neonGold],
    [24, 40, 12,  4, C.neonGold],
    [24, 48,  8,  4, C.neonGold],
    // $ sign — chunky and centered
    [60, 32,  8, 64, C.ink],
    [44, 36, 40,  8, C.ink],
    [40, 40, 12, 12, C.ink],
    [44, 56, 40,  8, C.ink],
    [76, 60, 12, 12, C.ink],
    [44, 72, 40,  8, C.ink],
    [40, 80, 12, 12, C.ink],
    [76, 80, 12, 12, C.ink],
    [44, 84, 40,  8, C.ink],
    [40, 40,  8,  4, C.inkSoft],
    [80, 84,  4,  4, C.inkSoft],
    [44, 44,  4,  4, C.inkSoft],
    // motion arcs (top + bottom) — small streaks
    [40,  4, 12,  4, C.gold],
    [56,  0, 16,  4, C.goldL],
    [76,  4, 12,  4, C.gold],
    [40, 120, 12, 4, C.goldD],
    [56, 124, 16, 4, C.gold],
    [76, 120, 12, 4, C.goldD],
  ],

  // ----- Roulette — top-down brass-rim wheel + ball at top -----
  "lobby.roulette": [
    // Outer brass rim
    [44,  8, 40,  4, C.gold],
    [28, 12, 72,  4, C.gold],
    [20, 16, 88,  4, C.gold],
    [16, 20, 96,  4, C.gold],
    [12, 24,104,  4, C.gold],
    [ 8, 28,112,  4, C.gold],
    [ 8, 32,112, 64, C.gold],
    [ 8, 96,112,  4, C.gold],
    [12,100,104,  4, C.gold],
    [16,104, 96,  4, C.gold],
    [20,108, 88,  4, C.gold],
    [28,112, 72,  4, C.gold],
    [44,116, 40,  4, C.gold],
    [44,  8, 40,  2, C.goldL],
    [44,118, 40,  2, C.goldDD],
    // Inner felt circle background (under the wedges)
    [40, 20, 48,  4, C.cactusD],
    [28, 24, 72,  4, C.cactusD],
    [20, 28, 88,  4, C.cactusD],
    [16, 32, 96, 64, C.cactusD],
    [20, 96, 88,  4, C.cactusD],
    [28,100, 72,  4, C.cactusD],
    [40,104, 48,  4, C.cactusD],
    // Pie wedges (12 of them, alternating colors) — radial via rectangles
    // Top-center wedge (red)
    [60, 24,  8, 12, C.crimson],
    [56, 28, 16,  8, C.crimson],
    // Top-right (black)
    [72, 28, 12, 12, C.ink],
    [80, 32,  8,  4, C.ink],
    // Right-top (red)
    [88, 36, 12, 12, C.crimson],
    [96, 40,  8,  4, C.crimson],
    // Right (black)
    [96, 48, 12, 16, C.ink],
    [100,56,  4,  4, C.ink],
    // Right-bottom (red)
    [88, 76, 12, 12, C.crimson],
    [96, 80,  8,  4, C.crimson],
    // Bottom-right (black)
    [72, 84, 12, 12, C.ink],
    [80, 88,  8,  4, C.ink],
    // Bottom-center (red)
    [60, 88,  8, 12, C.crimson],
    [56, 92, 16,  4, C.crimson],
    // Bottom-left (black)
    [44, 84, 12, 12, C.ink],
    [40, 88,  8,  4, C.ink],
    // Left-bottom (red)
    [28, 76, 12, 12, C.crimson],
    [24, 80,  8,  4, C.crimson],
    // Left (black)
    [20, 48, 12, 16, C.ink],
    [24, 56,  4,  4, C.ink],
    // Left-top (red)
    [28, 36, 12, 12, C.crimson],
    [24, 40,  8,  4, C.crimson],
    // Top-left (black)
    [44, 28, 12, 12, C.ink],
    [40, 32,  8,  4, C.ink],
    // Green zero spot (top-right of "12")
    [68, 24,  4,  8, C.cactus],
    // Center hub (gold + dark inset)
    [52, 52, 24, 24, C.goldDD],
    [56, 56, 16, 16, C.gold],
    [60, 60,  8,  8, C.neonGold],
    // Hub spokes
    [62, 36,  4, 16, C.goldDD],
    [62, 76,  4, 16, C.goldDD],
    [36, 62, 16,  4, C.goldDD],
    [76, 62, 16,  4, C.goldDD],
    // Ball at top of track
    [60, 24,  8,  8, C.parchL],
    [60, 24,  4,  4, C.white],
    // Numbers as tiny ink dots in each wedge
    [62, 26,  4,  4, C.parchL],     // ball halo
  ],

  // ----- Crash — rocket on rising parabolic trail -----
  "lobby.crash": [
    // Background — dark sky gradient + stars
    [ 0,  0,128, 64, "#3d2418"],
    [ 0,  0,128, 32, C.shadow],
    // Stars
    [16,  8,  4,  4, C.parchL],
    [40, 12,  4,  4, C.parchL],
    [76,  4,  4,  4, C.parchL],
    [108,12,  4,  4, C.parchL],
    [22, 28,  4,  4, C.parchL],
    [60, 20,  4,  4, C.parchL],
    [96, 24,  4,  4, C.parchL],
    [32, 44,  4,  4, C.parchM],
    [104,40,  4,  4, C.parchM],
    // Ground (lower band)
    [ 0, 64,128, 64, C.saddleD],
    [ 0, 64,128,  4, C.saddleM],
    // Parabolic trail (chunky dots from bottom-left up)
    [ 8,116, 8,  8, C.crimson],
    [16,108, 8,  8, C.crimson],
    [24,100, 8,  8, C.crimson],
    [32, 88, 8,  8, C.crimson],
    [40, 76, 8,  8, C.crimson],
    [48, 64, 8,  8, C.crimson],
    [56, 52, 8,  8, C.crimson],
    [64, 40, 8,  8, C.crimson],
    [72, 32, 8,  8, C.crimson],
    [80, 24, 8,  8, C.crimson],
    // Trail bright cores
    [10,118, 4,  4, C.gold],
    [18,110, 4,  4, C.gold],
    [26,102, 4,  4, C.neonGold],
    [34, 90, 4,  4, C.neonGold],
    [42, 78, 4,  4, C.neonGold],
    [50, 66, 4,  4, C.neonGold],
    [58, 54, 4,  4, C.neonGold],
    [66, 42, 4,  4, C.neonGold],
    [74, 34, 4,  4, C.neonGold],
    [82, 26, 4,  4, C.neonGold],
    // Rocket body (vertical white capsule, top-right)
    [88, 12, 16, 36, C.parchL],
    [88, 12,  4, 36, C.parchM],
    [100,12,  4, 36, C.parchD],
    // Top trim
    [88, 16, 16,  4, C.crimsonD],
    [88, 28, 16,  4, C.crimsonD],
    [88, 44, 16,  4, C.crimsonD],
    // Window
    [92, 20,  8,  8, C.sky],
    [92, 20,  4,  4, C.skyL],
    // Nose cone
    [92,  4,  8,  8, C.crimson],
    [96,  0,  4,  4, C.crimson],
    // Fins
    [80, 36,  8, 16, C.crimsonDD],
    [104,36,  8, 16, C.crimsonDD],
    [80, 48,  8,  4, C.crimsonD],
    [104,48,  8,  4, C.crimsonD],
    // Exhaust flame
    [88, 48, 16,  8, C.gold],
    [92, 56,  8,  8, C.neonGold],
    [92, 64,  8,  8, C.crimson],
    [96, 72,  4,  4, C.crimsonD],
    // Mountain silhouette in background
    [16, 80, 24, 12, C.shadow],
    [56, 76, 32, 16, C.shadow],
    [110,82, 18, 10, C.shadow],
  ],

  // ----- Plinko — pegboard with ball + multiplier buckets -----
  "lobby.plinko": [
    // Frame
    [ 0,  0,128,128, C.ink],
    [ 4,  4,120,120, C.shadow],
    [ 8,  8,112,112, C.saddleD],
    // Pegs — staggered rows. Each peg = 6×6 px gold disc with shading
    ...peg128(20, 22), ...peg128(36, 22), ...peg128(52, 22), ...peg128(68, 22), ...peg128(84, 22), ...peg128(100, 22),
    ...peg128(28, 38), ...peg128(44, 38), ...peg128(60, 38), ...peg128(76, 38), ...peg128(92, 38),
    ...peg128(20, 54), ...peg128(36, 54), ...peg128(52, 54), ...peg128(68, 54), ...peg128(84, 54), ...peg128(100,54),
    ...peg128(28, 70), ...peg128(44, 70), ...peg128(60, 70), ...peg128(76, 70), ...peg128(92, 70),
    ...peg128(20, 86), ...peg128(36, 86), ...peg128(52, 86), ...peg128(68, 86), ...peg128(84, 86), ...peg128(100,86),
    // Ball at top
    [60,  8,  8,  4, C.gold],
    [56, 12, 16, 12, C.neonGold],
    [60, 24,  8,  4, C.goldD],
    [60, 12,  4,  4, C.parchL],
    // Buckets at the bottom — colored slots with tiny multiplier glyphs
    [ 8,100, 20, 18, C.cactusD],
    [28,100, 20, 18, C.gold],
    [48,100, 20, 18, C.crimson],
    [68,100, 20, 18, C.neonCrim],
    [88,100, 20, 18, C.gold],
    [108,100,12, 18, C.cactusD],
    // Bucket caps
    [ 8,100, 20,  4, C.cactus],
    [28,100, 20,  4, C.goldL],
    [48,100, 20,  4, C.crimsonD],
    [68,100, 20,  4, C.crimson],
    [88,100, 20,  4, C.goldL],
    [108,100,12,  4, C.cactus],
    // Bucket dividers
    [28,100, 2, 24, C.ink],
    [48,100, 2, 24, C.ink],
    [68,100, 2, 24, C.ink],
    [88,100, 2, 24, C.ink],
    [108,100,2, 24, C.ink],
    // Center "x" multiplier mark (largest bucket has biggest payout)
    [56,108, 4,  4, C.parchL],
    [60,112, 4,  4, C.parchL],
    [56,112, 4,  4, C.parchL],
    [60,108, 4,  4, C.parchL],
  ],

  // ----- Blackjack — fanned face cards + chip stack -----
  "lobby.blackjack": [
    // Felt background tone
    [ 0, 96,128, 32, C.cactusD],
    // Back card (10 of clubs) — leftmost
    [12, 28, 32, 80, C.parchL],
    [12, 28, 32,  4, C.parchM],
    [12,104, 32,  4, C.parchD],
    [12, 28,  4, 80, C.parchM],
    [40, 28,  4, 80, C.parchD],
    // 10 corner
    [16, 32,  4,  4, C.ink],
    [20, 32,  4,  4, C.ink],
    // club
    [20, 36,  4,  4, C.ink],
    [16, 40,  4,  4, C.ink],
    [24, 40,  4,  4, C.ink],
    [16, 44, 12,  4, C.ink],
    [20, 48,  4,  4, C.ink],
    // big number 10 in middle
    [20, 64,  4, 16, C.ink],
    [28, 64,  8, 16, C.ink],
    // bottom 10 (rotated)
    [20,100,  4,  4, C.ink],
    [24,100,  4,  4, C.ink],
    // Middle card (Ace of spades) — overlap
    [40, 16, 36, 88, C.parchL],
    [40, 16, 36,  4, C.parchM],
    [40,100, 36,  4, C.parchD],
    [40, 16,  4, 88, C.parchM],
    [72, 16,  4, 88, C.parchD],
    // Big spade in middle
    [54, 36,  4,  4, C.ink],
    [50, 40, 12,  4, C.ink],
    [46, 44, 20,  8, C.ink],
    [42, 52, 28,  4, C.ink],
    [50, 56, 12,  4, C.ink],
    [54, 60,  4,  8, C.ink],
    [50, 68, 12,  4, C.ink],
    // A corner top-left
    [44, 20,  4,  4, C.ink],
    [44, 24,  4,  4, C.ink],
    [48, 24,  4,  4, C.ink],
    [44, 28,  4,  4, C.ink],
    [52, 24,  4,  8, C.ink],
    // Letter A bottom
    [48, 80,  4, 16, C.ink],
    [60, 80,  4, 16, C.ink],
    [48, 80, 16,  4, C.ink],
    [48, 88, 16,  4, C.ink],
    // Front card (King of hearts) — rightmost, slight tilt
    [72,  8, 36, 96, C.parchL],
    [72,  8, 36,  4, C.parchM],
    [72,100, 36,  4, C.parchD],
    [72,  8,  4, 96, C.parchM],
    [104, 8,  4, 96, C.parchD],
    // Heart suits — top-left
    [76, 12,  4,  4, C.crimson],
    [80, 12,  4,  4, C.crimson],
    [76, 16,  4,  4, C.crimson],
    [80, 16,  4,  4, C.crimson],
    // K letter middle — bigger stylized
    [80, 36,  4, 32, C.crimson],
    [92, 36,  4,  4, C.crimson],
    [88, 40,  4,  4, C.crimson],
    [84, 44,  8,  4, C.crimson],
    [88, 48,  4,  4, C.crimson],
    [92, 52,  4,  4, C.crimson],
    [96, 56,  4,  4, C.crimson],
    // Big crown over K
    [80, 72, 24,  4, C.gold],
    [80, 72,  4,  8, C.gold],
    [88, 76,  4,  4, C.gold],
    [100,72,  4,  8, C.gold],
    [88, 80, 12,  4, C.gold],
    // Crown jewels
    [84, 76,  4,  4, C.crimson],
    [96, 76,  4,  4, C.crimson],
    // Chip stack lower-left
    [ 0,108, 36, 12, C.crimsonD],
    [ 0,108, 36,  4, C.neonCrim],
    [ 0,116, 36,  4, C.crimsonDD],
    [ 0,120, 36,  8, C.gold],
    [ 0,120, 36,  4, C.goldL],
    [ 4,104, 28,  4, C.parchL],
    [ 4,104,  4,  4, C.crimson],
    [12,104,  4,  4, C.crimson],
    [20,104,  4,  4, C.crimson],
    [28,104,  4,  4, C.crimson],
  ],

  // ----- Poker — big chip stack with cards face-up -----
  "lobby.poker": [
    // Felt background
    [ 0, 64,128, 64, C.cactusD],
    [ 0, 64,128,  4, C.cactus],
    // Chip stacks (4 stacks of varying heights)
    // Stack 1 — short red
    [ 8, 88, 24, 32, C.crimsonD],
    [ 8, 88, 24,  4, C.crimson],
    [ 8, 92, 24,  4, C.parchL],
    [ 8, 96, 24,  4, C.crimsonD],
    [ 8,100, 24,  4, C.parchL],
    [ 8,104, 24,  4, C.crimsonD],
    [ 8,108, 24,  4, C.parchL],
    [ 8,112, 24,  4, C.crimsonD],
    [ 8,116, 24,  4, C.parchL],
    [ 8, 88,  4, 32, C.crimson],
    [28, 88,  4, 32, C.crimsonDD],
    // Stack 2 — taller gold
    [36, 72, 24, 48, C.goldD],
    [36, 72, 24,  4, C.gold],
    [36, 76, 24,  4, C.parchL],
    [36, 80, 24,  4, C.goldD],
    [36, 84, 24,  4, C.parchL],
    [36, 88, 24,  4, C.goldD],
    [36, 92, 24,  4, C.parchL],
    [36, 96, 24,  4, C.goldD],
    [36,100, 24,  4, C.parchL],
    [36,104, 24,  4, C.goldD],
    [36,108, 24,  4, C.parchL],
    [36,112, 24,  4, C.goldD],
    [36,116, 24,  4, C.parchL],
    [36, 72,  4, 48, C.gold],
    [56, 72,  4, 48, C.goldDD],
    // Stack 3 — black tallest
    [64, 56, 24, 64, C.ink],
    [64, 56, 24,  4, C.inkSoft],
    [64, 60, 24,  4, C.parchL],
    [64, 64, 24,  4, C.ink],
    [64, 68, 24,  4, C.parchL],
    [64, 72, 24,  4, C.ink],
    [64, 76, 24,  4, C.parchL],
    [64, 80, 24,  4, C.ink],
    [64, 84, 24,  4, C.parchL],
    [64, 88, 24,  4, C.ink],
    [64, 92, 24,  4, C.parchL],
    [64, 96, 24,  4, C.ink],
    [64,100, 24,  4, C.parchL],
    [64,104, 24,  4, C.ink],
    [64,108, 24,  4, C.parchL],
    [64,112, 24,  4, C.ink],
    [64,116, 24,  4, C.parchL],
    [64, 56,  4, 64, C.inkSoft],
    [84, 56,  4, 64, C.shadow],
    // Two cards leaning behind (Q♦ + Q♠)
    [40, 20, 32, 56, C.parchL],
    [40, 20, 32,  4, C.parchM],
    [40, 72, 32,  4, C.parchD],
    [40, 20,  4, 56, C.parchM],
    [68, 20,  4, 56, C.parchD],
    // Diamond
    [54, 32,  4,  4, C.crimson],
    [50, 36, 12,  4, C.crimson],
    [46, 40, 20,  4, C.crimson],
    [50, 44, 12,  4, C.crimson],
    [54, 48,  4,  4, C.crimson],
    // Q letter on diamond card
    [48, 56,  8, 12, C.crimson],
    [56, 56,  8, 12, C.crimson],
    [48, 56, 16,  4, C.crimson],
    [48, 64, 16,  4, C.crimson],
    [60, 64,  4,  8, C.crimson],
    // Second card (front, A spade)
    [76, 12, 32, 60, C.parchL],
    [76, 12, 32,  4, C.parchM],
    [76, 68, 32,  4, C.parchD],
    [76, 12,  4, 60, C.parchM],
    [104,12,  4, 60, C.parchD],
    // Spade
    [88, 24,  4,  4, C.ink],
    [84, 28, 12,  4, C.ink],
    [80, 32, 20,  4, C.ink],
    [84, 36, 12,  4, C.ink],
    [88, 40,  4,  4, C.ink],
    // A letter
    [82, 50,  4, 14, C.ink],
    [94, 50,  4, 14, C.ink],
    [82, 50, 16,  4, C.ink],
    [82, 56, 16,  4, C.ink],
    // Stars / sparkles on felt
    [16, 76,  4,  4, C.parchL],
    [108,76,  4,  4, C.parchL],
  ],

  // ----- Crossy Road — chicken hopping over road -----
  "lobby.crossy_road": [
    // Sky / grass top
    [ 0,  0,128, 32, C.cactusL],
    [ 0,  0,128,  4, C.cactus],
    [ 0, 28,128,  4, C.cactus],
    // Road
    [ 0, 32,128, 96, C.ink],
    [ 0,124,128,  4, C.shadow],
    // Lane stripes (white dashes on top of dark road)
    [ 0, 56, 16,  6, C.parchL],
    [32, 56, 16,  6, C.parchL],
    [64, 56, 16,  6, C.parchL],
    [96, 56, 16,  6, C.parchL],
    [ 0, 88, 16,  6, C.gold],
    [32, 88, 16,  6, C.gold],
    [64, 88, 16,  6, C.gold],
    [96, 88, 16,  6, C.gold],
    [ 0,116, 16,  6, C.parchL],
    [32,116, 16,  6, C.parchL],
    [64,116, 16,  6, C.parchL],
    [96,116, 16,  6, C.parchL],
    // Tree on left of grass
    [12,  4, 16, 16, C.cactusD],
    [16,  0, 12,  8, C.cactusD],
    [20,  0,  4,  4, C.cactus],
    [16,  4,  4,  4, C.cactus],
    [16, 20,  8, 12, C.saddleD],
    // Tree on right
    [104,  4, 16, 16, C.cactusD],
    [108,  0, 12,  8, C.cactusD],
    [112,  0,  4,  4, C.cactus],
    [108,  4,  4,  4, C.cactus],
    [108, 20,  8, 12, C.saddleD],
    // Hop-arc dotted shadow
    [40, 76,  6,  6, C.shadow],
    // Chicken — body
    [56, 36, 16, 24, C.parchL],
    [56, 36, 16,  4, C.parchM],
    [52, 40,  4, 16, C.parchL],
    [72, 40,  4, 16, C.parchL],
    [56, 56, 16,  4, C.parchD],
    // Chicken belly white
    [56, 52, 16,  4, C.parchL],
    // Comb (red)
    [60, 28,  4,  4, C.crimson],
    [64, 28,  4,  4, C.crimson],
    [60, 32,  8,  4, C.crimson],
    [56, 32,  4,  4, C.crimson],
    // Beak
    [72, 44,  8,  6, C.gold],
    [72, 50,  8,  4, C.goldD],
    // Eye
    [64, 40,  6,  6, C.parchL],
    [66, 42,  4,  4, C.ink],
    // Wing tucked
    [52, 48,  4, 12, C.parchM],
    // Legs
    [56, 60,  4, 12, C.gold],
    [68, 60,  4, 12, C.gold],
    [52, 72,  8,  4, C.goldD],
    [64, 72,  8,  4, C.goldD],
    // Approaching wagon (tiny)
    [88, 80, 32, 12, C.crimson],
    [88, 80, 32,  4, C.crimsonD],
    [88, 80,  4, 12, C.crimsonDD],
    [116,80,  4, 12, C.crimsonDD],
    [92, 92, 24,  4, C.shadow],
    [88, 84, 16,  4, C.skyL],   // window
    // Wagon wheels
    [92, 92,  6,  6, C.ink],
    [110,92,  6,  6, C.ink],
    [94, 94,  2,  2, C.parchL],
    [112,94,  2,  2, C.parchL],
  ],

  // ----- Flappy — bird mid-flap between pipes + sky -----
  "lobby.flappy": [
    // Sky gradient (3 bands)
    [ 0,  0,128, 32, C.skyL],
    [ 0, 32,128, 32, "#a8d4ec"],
    [ 0, 64,128, 32, C.skyL],
    // Sun
    [104,  8, 16, 16, C.gold],
    [108,  4,  8,  4, C.gold],
    [108, 24,  8,  4, C.gold],
    [100, 12,  4,  8, C.gold],
    [120, 12,  4,  8, C.gold],
    [108,  8,  8,  8, C.neonGold],
    // Clouds
    [16, 16, 24,  6, C.parchL],
    [12, 22, 32,  4, C.parchL],
    [60,  4, 28,  6, C.parchL],
    [56, 10, 36,  4, C.parchL],
    // Ground
    [ 0, 96,128, 32, C.saddleM],
    [ 0, 96,128,  4, C.saddleL],
    [ 0,124,128,  4, C.saddleD],
    // Ground stripes
    [ 0,108, 16,  6, C.saddleD],
    [32,108, 16,  6, C.saddleD],
    [64,108, 16,  6, C.saddleD],
    [96,108, 16,  6, C.saddleD],
    // Top pipe (left)
    [16,  0, 32, 56, C.cactus],
    [16,  0,  4, 56, C.cactusD],
    [44,  0,  4, 56, C.cactusL],
    // Top pipe cap
    [12, 48, 40, 12, C.cactus],
    [12, 48, 40,  4, C.cactusL],
    [12, 56, 40,  4, C.cactusD],
    // Bottom pipe (right)
    [80, 72, 32, 56, C.cactus],
    [80, 72,  4, 56, C.cactusD],
    [108,72,  4, 56, C.cactusL],
    // Bottom pipe cap
    [76, 64, 40, 12, C.cactus],
    [76, 64, 40,  4, C.cactusL],
    [76, 72, 40,  4, C.cactusD],
    // Bird body
    [56, 48, 24, 24, C.gold],
    [56, 48, 24,  4, C.goldL],
    [52, 52,  4, 16, C.gold],
    [80, 52,  4, 16, C.goldD],
    // Bird belly white
    [60, 64, 16, 12, C.parchL],
    // Bird beak
    [80, 56, 12,  8, C.crimson],
    [80, 64, 12,  4, C.crimsonD],
    // Eye
    [72, 52,  8,  8, C.parchL],
    [76, 56,  4,  4, C.ink],
    // Wing flap (animated up position)
    [48, 56, 12, 16, C.goldD],
    [44, 60,  8, 12, C.goldDD],
    // Bird legs/feet tucked
    [60, 72,  4,  4, C.crimsonD],
    [72, 72,  4,  4, C.crimsonD],
    // Distant pipe outline (background)
    [122, 24, 6, 36, C.cactusD],
  ],

  // ----- Monopoly — top hat on a property card -----
  "lobby.monopoly": [
    // Felt background
    [ 0,  0,128,128, C.cactusD],
    [ 0,  0,128,  4, C.cactus],
    // Card
    [16, 16, 96, 96, C.parchL],
    [16, 16, 96,  4, C.parchM],
    [16,108, 96,  4, C.parchD],
    [16, 16,  4, 96, C.parchM],
    [108,16,  4, 96, C.parchD],
    // Top color band (purple/red ownership stripe)
    [16, 16, 96, 24, C.crimson],
    [16, 16, 96,  4, C.neonCrim],
    [16, 36, 96,  4, C.crimsonD],
    // Card title text marks (faux text)
    [24, 44, 80,  2, C.ink],
    [24, 50, 64,  2, C.saddleD],
    [24, 56, 48,  2, C.saddleD],
    // Top hat — band
    [40, 60, 48, 32, C.ink],
    [40, 60, 48,  4, C.shadow],
    [84, 60,  4, 32, C.shadow],
    [40, 78, 48,  6, C.crimson],
    [40, 78, 48,  2, C.crimsonD],
    // Brim
    [28, 88, 72, 12, C.ink],
    [28, 88, 72,  2, C.shadow],
    [28, 98, 72,  2, C.shadow],
    // Hat shine
    [44, 64,  4, 12, C.inkSoft],
    [50, 64,  2,  4, C.inkSoft],
    // $ sign at bottom
    [54,108,  4, 16, C.cactusL],
    [44,112, 24,  4, C.cactus],
    [44,118, 24,  4, C.cactus],
    [44,108, 28,  4, C.cactus],
    [60, 96,  4,  4, C.cactusL],
    // Coin under card
    [96, 96, 16, 16, C.gold],
    [98, 98, 12, 12, C.goldD],
    [100,100, 8,  8, C.gold],
    [104,104, 4,  4, C.neonGold],
  ],
};

// =============================================================
// LOBBY TILE ART — 32×32 grid (smaller / simpler scenes)
// One miniature scene per game, hand-laid.
// =============================================================
const LOBBY_ICONS_32: Partial<Record<IconName, Px[]>> = {
  // ----- Coin Flip — single big spinning coin with $ -----
  "lobby.coinflip": [
    // Coin disc, octagonal staircase
    [12,  4,  8, 1, C.goldD],
    [10,  5, 12, 1, C.goldD],
    [ 8,  6, 16, 1, C.goldD],
    [ 9,  6, 14, 1, C.gold],
    [ 7,  7, 18, 1, C.goldD],
    [ 8,  7, 16, 1, C.gold],
    [ 6,  8, 20, 1, C.goldD],
    [ 7,  8, 18, 1, C.gold],
    [ 5,  9, 22, 14, C.goldD],
    [ 6,  9, 20, 14, C.gold],
    [ 6, 23, 20, 1, C.goldD],
    [ 7, 23, 18, 1, C.gold],
    [ 7, 24, 18, 1, C.goldD],
    [ 8, 24, 16, 1, C.gold],
    [ 8, 25, 16, 1, C.goldD],
    [ 9, 25, 14, 1, C.gold],
    [10, 26, 12, 1, C.goldD],
    [12, 27,  8, 1, C.goldD],
    // Inner shine arc (top-left)
    [ 9,  9, 12, 1, C.goldL],
    [ 7, 11,  3, 1, C.goldL],
    [ 6, 13,  2, 4, C.goldL],
    [ 8, 10,  2, 1, C.neonGold],
    // $ symbol
    [15,  8,  2, 16, C.ink],
    [11, 10,  9, 2, C.ink],
    [11, 11,  3, 3, C.ink],
    [11, 14,  9, 2, C.ink],
    [18, 15,  3, 3, C.ink],
    [11, 18,  9, 2, C.ink],
    [11, 21,  3, 3, C.ink],
    [18, 11,  3, 1, C.inkSoft],
    [11, 21,  3, 1, C.inkSoft],
    // Tiny shine highlight
    [10, 10,  1, 1, C.parchL],
    // Motion arcs (subtle, top + bottom)
    [12,  2,  2, 1, C.goldL],
    [16,  1,  2, 1, C.gold],
    [20,  2,  2, 1, C.goldL],
    [12, 29,  2, 1, C.goldL],
    [18, 30,  2, 1, C.gold],
  ],

  // ----- Coin Flip Duel — two crossed coins, big -----
  "lobby.coinflip_duel": [
    // Back coin (top-left, slightly tilted)
    [ 5,  3, 10, 1, C.goldD],
    [ 3,  4, 14, 1, C.goldD],
    [ 4,  4, 12, 1, C.gold],
    [ 2,  5, 16, 9, C.goldD],
    [ 3,  5, 14, 9, C.gold],
    [ 3, 14, 14, 1, C.goldD],
    [ 4, 14, 12, 1, C.gold],
    [ 5, 15, 10, 1, C.goldD],
    // Back coin "H"
    [ 6,  7, 1, 5, C.ink],
    [13,  7, 1, 5, C.ink],
    [ 7,  9, 6, 1, C.ink],
    [ 4,  6, 1, 1, C.goldL],
    [ 5,  5, 2, 1, C.goldL],
    // Front coin (bottom-right)
    [16, 16, 12, 1, C.goldD],
    [14, 17, 16, 1, C.goldD],
    [15, 17, 14, 1, C.gold],
    [13, 18, 18, 11, C.goldD],
    [14, 18, 16, 11, C.gold],
    [14, 29, 16, 1, C.goldD],
    [15, 29, 14, 1, C.gold],
    [16, 30, 12, 1, C.goldD],
    // Front coin "T"
    [18, 21,  8, 1, C.ink],
    [21, 21,  2, 5, C.ink],
    [15, 19,  2, 1, C.goldL],
    [16, 18,  3, 1, C.goldL],
    // Sparks between
    [12, 12, 1, 1, C.neonGold],
    [16, 13, 1, 1, C.neonGold],
    [13, 14, 1, 1, C.neonGold],
  ],

  // ----- Dice — pair of pixel dice, white + red -----
  "lobby.dice": [
    // White die (back-left)
    [ 4,  3, 14, 14, C.parchL],
    [ 4,  3, 14,  1, C.parchM],
    [ 4, 16, 14,  1, C.parchD],
    [ 4,  3,  1, 14, C.parchM],
    [17,  3,  1, 14, C.parchD],
    // 5-pips
    [ 6,  5,  2, 2, C.ink],
    [14,  5,  2, 2, C.ink],
    [10,  9,  2, 2, C.ink],
    [ 6, 13,  2, 2, C.ink],
    [14, 13,  2, 2, C.ink],
    // Red die (front-right)
    [14, 14, 14, 14, C.crimson],
    [14, 14, 14,  1, C.neonCrim],
    [14, 27, 14,  1, C.crimsonDD],
    [14, 14,  1, 14, C.neonCrim],
    [27, 14,  1, 14, C.crimsonDD],
    // 3-pips diagonal
    [16, 16,  2, 2, C.parchL],
    [20, 20,  2, 2, C.parchL],
    [24, 24,  2, 2, C.parchL],
    // Felt shadow under
    [ 4, 28, 24,  1, C.shadow],
    [ 6, 29, 20,  1, C.inkSoft],
  ],

  // ----- Slots — slot machine cabinet -----
  "lobby.slots": [
    // Marquee top (gold)
    [ 4,  2, 24,  3, C.gold],
    [ 4,  2, 24,  1, C.goldL],
    [ 4,  4, 24,  1, C.goldD],
    // Cabinet body
    [ 3,  5, 26, 22, C.crimson],
    [ 3,  5, 26,  1, C.neonCrim],
    [ 3, 26, 26,  1, C.crimsonDD],
    [ 3,  5,  1, 22, C.crimsonD],
    [28,  5,  1, 22, C.crimsonDD],
    // Reel window (dark inset)
    [ 5, 10, 18, 10, C.ink],
    [ 5, 10, 18,  1, C.shadow],
    // Three reels
    [ 6, 11,  5,  8, C.parchL],
    [12, 11,  5,  8, C.parchL],
    [18, 11,  5,  8, C.parchL],
    // Symbols on reels: cherry / bell / star
    [ 7, 13,  3,  3, C.crimson],
    [ 8, 12,  1,  1, C.cactus], // stem
    [13, 13,  3,  3, C.gold],
    [13, 16,  3,  1, C.goldD],
    [19, 12,  1,  1, C.gold],   // star top
    [18, 13,  3,  1, C.gold],
    [19, 14,  1,  3, C.gold],
    [18, 15,  3,  1, C.gold],
    // Gold trim around the reel window
    [ 4,  9, 20,  1, C.goldD],
    [ 4, 20, 20,  1, C.goldD],
    // Lever
    [27,  6,  3,  3, C.crimson],
    [28,  9,  1,  6, C.gold],
    [27, 14,  3,  2, C.crimsonD],
    // Coin tray
    [ 5, 22, 18,  3, C.saddleD],
    [ 5, 22, 18,  1, C.saddle],
    // JACKPOT band on marquee
    [ 7,  3,  2,  1, C.ink],
    [10,  3,  2,  1, C.ink],
    [13,  3,  2,  1, C.ink],
    [16,  3,  2,  1, C.ink],
    [19,  3,  2,  1, C.ink],
    [22,  3,  2,  1, C.ink],
  ],

  // ----- Blackjack — fanned cards over a chip -----
  "lobby.blackjack": [
    // Back card (K) — leftmost, slight rotation feel via stacking
    [ 4,  6,  9, 22, C.parchL],
    [ 4,  6,  9,  1, C.parchM],
    [ 4, 27,  9,  1, C.parchD],
    [ 4,  6,  1, 22, C.parchM],
    [12,  6,  1, 22, C.parchD],
    // K corner — small spade
    [ 6,  9,  1,  1, C.ink],
    [ 6, 10,  3,  1, C.ink],
    [ 5, 11,  5,  3, C.ink],
    // K letter
    [ 6, 18,  1,  4, C.ink],
    [ 9, 18,  1,  1, C.ink],
    [10, 19,  1,  1, C.ink],
    [ 9, 20,  1,  1, C.ink],
    [10, 21,  1,  1, C.ink],
    // Middle card (A) — overlap right
    [11,  4,  9, 22, C.parchL],
    [11,  4,  9,  1, C.parchM],
    [11, 25,  9,  1, C.parchD],
    [11,  4,  1, 22, C.parchM],
    [19,  4,  1, 22, C.parchD],
    // big spade in middle
    [14, 10,  3,  1, C.ink],
    [13, 11,  5,  4, C.ink],
    [12, 13,  7,  2, C.ink],
    [15, 15,  1,  2, C.ink],
    // A letter
    [13, 17,  1,  4, C.ink],
    [17, 17,  1,  4, C.ink],
    [13, 17,  5,  1, C.ink],
    [13, 19,  5,  1, C.ink],
    // Front card (heart) — right
    [18,  3,  9, 22, C.parchL],
    [18,  3,  9,  1, C.parchM],
    [18, 24,  9,  1, C.parchD],
    [18,  3,  1, 22, C.parchM],
    [26,  3,  1, 22, C.parchD],
    // heart shape
    [20,  9,  2,  2, C.crimson],
    [23,  9,  2,  2, C.crimson],
    [20, 11,  5,  2, C.crimson],
    [21, 13,  3,  1, C.crimson],
    [22, 14,  1,  1, C.crimson],
    // J letter
    [22, 16,  1,  4, C.crimson],
    [20, 19,  3,  1, C.crimson],
    [20, 18,  1,  1, C.crimson],
    // Chip stack at bottom-left
    [ 2, 25,  9,  3, C.crimsonDD],
    [ 2, 25,  9,  1, C.crimson],
    [ 3, 24,  7,  1, C.parchL],
    [ 3, 24,  1,  1, C.crimson],
    [ 9, 24,  1,  1, C.crimson],
    [ 6, 24,  1,  1, C.crimson],
    [ 2, 28,  9,  2, C.crimsonD],
    [ 2, 30,  9,  1, C.shadow],
  ],

  // ----- Roulette — top-down wheel -----
  "lobby.roulette": [
    // Outer brass rim
    [12,  2,  8, 1, C.gold],
    [ 9,  3, 14, 1, C.gold],
    [ 7,  4, 18, 1, C.gold],
    [ 5,  5, 22, 1, C.gold],
    [ 4,  6, 24, 2, C.gold],
    [ 3,  8, 26, 16, C.gold],
    [ 4, 24, 24, 2, C.gold],
    [ 5, 26, 22, 1, C.gold],
    [ 7, 27, 18, 1, C.gold],
    [ 9, 28, 14, 1, C.gold],
    [12, 29,  8, 1, C.gold],
    // Inner felt ring
    [11,  4, 10, 1, C.cactusD],
    [ 8,  5, 16, 1, C.cactusD],
    [ 6,  6, 20, 2, C.cactusD],
    [ 5,  8, 22, 16, C.cactusD],
    [ 6, 24, 20, 2, C.cactusD],
    [ 8, 26, 16, 1, C.cactusD],
    [11, 27, 10, 1, C.cactusD],
    // Wedges (red/black/green simplified)
    [13,  6, 6, 2, C.crimson],
    [ 7,  9, 4, 4, C.ink],
    [21,  9, 4, 4, C.crimson],
    [ 7, 19, 4, 4, C.crimson],
    [21, 19, 4, 4, C.ink],
    [13, 24, 6, 2, C.ink],
    [11, 12, 4, 4, C.crimson],
    [17, 12, 4, 4, C.ink],
    [11, 16, 4, 4, C.ink],
    [17, 16, 4, 4, C.crimson],
    // Hub
    [13, 13, 6, 6, C.gold],
    [13, 13, 6, 1, C.goldL],
    [13, 18, 6, 1, C.goldD],
    [14, 14, 4, 4, C.neonGold],
    [15, 15, 2, 2, C.goldDD],
    // Ball at the top of the track
    [16,  6, 2, 2, C.parchL],
    [16,  6, 1, 1, C.white],
  ],

  // ----- Mines — 4×4 grid with bomb + gem -----
  "lobby.mines": [
    // Frame
    [ 2,  2, 28, 28, C.saddleD],
    [ 2,  2, 28,  1, C.saddleM],
    [ 2, 29, 28,  1, C.shadow],
    // 16 tiles in 4×4 grid (each 6×6 with 1px gap)
    // Hidden tiles
    ...mineTile(4, 4),
    ...mineTile(11, 4),
    ...mineTile(25, 4),
    ...mineTile(4, 11),
    ...mineTile(11, 11),
    ...mineTile(18, 11),
    ...mineTile(4, 18),
    ...mineTile(11, 18),
    ...mineTile(18, 18),
    ...mineTile(25, 18),
    ...mineTile(4, 25),
    ...mineTile(18, 25),
    ...mineTile(25, 25),
    // Revealed bomb at center (replaces tile @ 18,4)
    [18,  4,  6,  6, C.parchM],
    [18,  4,  6,  1, C.parchD],
    [22,  6,  3,  3, C.ink],
    [21,  5,  4,  4, C.ink],
    [22,  4,  1,  1, C.crimson], // fuse spark
    [22,  3,  1,  1, C.neonGold],
    [22,  6,  1,  1, C.parchL], // shine
    // Revealed gem (replaces tile @ 25,11)
    [25, 11,  6,  6, C.parchM],
    [27, 12,  2,  1, C.cactusL],
    [26, 13,  4,  1, C.cactus],
    [27, 14,  2,  2, C.cactus],
    [28, 15,  1,  1, C.cactusD],
    [27, 16,  1,  1, C.cactusD],
    // Revealed gem (replaces tile @ 11, 25 -> use 11,25 for second gem)
    [11, 25,  6,  6, C.parchM],
    [13, 26,  2,  1, C.skyL],
    [12, 27,  4,  1, C.sky],
    [13, 28,  2,  2, C.sky],
    [14, 29,  1,  1, C.skyD],
  ],

  // ----- Plinko — pegboard with ball + bottom buckets -----
  "lobby.plinko": [
    // Frame
    [ 2,  2, 28, 28, C.ink],
    [ 3,  3, 26, 26, C.saddleD],
    // Pegs (5 rows: 5/4/5/4/5 staggered)
    ...pegRow(8, [6, 12, 18, 24]),
    ...pegRow(12, [9, 15, 21]),
    ...pegRow(16, [6, 12, 18, 24]),
    ...pegRow(20, [9, 15, 21]),
    // Ball at top
    [15,  4, 3, 1, C.gold],
    [14,  5, 5, 3, C.neonGold],
    [15,  8, 3, 1, C.goldD],
    [15,  5, 1, 1, C.parchL],
    // Bottom buckets
    [ 3, 24,  6, 5, C.cactusD],
    [ 9, 24,  6, 5, C.gold],
    [15, 24,  6, 5, C.crimson],
    [21, 24,  6, 5, C.gold],
    [ 3, 24,  6, 1, C.cactus],
    [ 9, 24,  6, 1, C.goldL],
    [15, 24,  6, 1, C.neonCrim],
    [21, 24,  6, 1, C.goldL],
    // Center pop bucket label "x"
    [16, 26, 1, 1, C.ink],
    [17, 27, 1, 1, C.ink],
    [16, 27, 1, 1, C.ink],
    [17, 26, 1, 1, C.ink],
    [10, 26, 3, 1, C.ink],
    [11, 27, 1, 1, C.ink],
  ],

  // ----- Crash — rocket on rising trail -----
  "lobby.crash": [
    // Trail (parabolic dotted curve from bottom-left up-right)
    [ 2, 28, 2, 1, C.crimson],
    [ 4, 27, 2, 1, C.crimson],
    [ 6, 25, 2, 1, C.crimson],
    [ 8, 23, 2, 1, C.crimson],
    [10, 20, 2, 1, C.crimson],
    [12, 17, 2, 1, C.crimson],
    [14, 14, 2, 1, C.crimson],
    [16, 11, 2, 1, C.crimson],
    [18,  9, 2, 1, C.crimson],
    [ 4, 28, 2, 1, C.crimsonDD],
    [ 6, 26, 2, 1, C.crimsonDD],
    [ 8, 24, 2, 1, C.crimsonDD],
    [10, 21, 2, 1, C.crimsonDD],
    [12, 18, 2, 1, C.crimsonDD],
    [14, 15, 2, 1, C.crimsonDD],
    [16, 12, 2, 1, C.crimsonDD],
    // Rocket body
    [22,  4,  4,  8, C.parchL],
    [22,  4,  1,  8, C.parchD],
    [25,  4,  1,  8, C.parchM],
    // Nose cone (top-right)
    [24,  2,  2,  2, C.crimson],
    [25,  1,  1,  1, C.crimson],
    // Body trim
    [22,  6,  4,  1, C.crimsonD],
    [22,  9,  4,  1, C.crimsonD],
    // Window
    [23,  7,  2,  2, C.sky],
    [23,  7,  1,  1, C.skyL],
    // Fins
    [20,  9,  2,  3, C.crimsonDD],
    [26,  9,  2,  3, C.crimsonDD],
    [20, 11,  2,  1, C.crimsonD],
    [26, 11,  2,  1, C.crimsonD],
    // Exhaust flame
    [22, 12,  4,  2, C.gold],
    [23, 14,  2,  2, C.neonGold],
    [23, 16,  2,  1, C.crimson],
    // Stars
    [ 4,  4,  1,  1, C.parchL],
    [ 8,  6,  1,  1, C.parchL],
    [12,  3,  1,  1, C.parchL],
    [18,  2,  1,  1, C.parchL],
    [ 6,  2,  1,  1, C.parchL],
  ],

  // ----- Poker — chip stack + cards -----
  "lobby.poker": [
    // Background card-back fan
    [ 4, 14, 12, 16, C.crimsonD],
    [ 4, 14, 12,  1, C.crimson],
    [ 4, 29, 12,  1, C.crimsonDD],
    [15, 14,  1, 16, C.crimsonDD],
    [ 4, 14,  1, 16, C.crimson],
    // Diamond pattern on back
    [ 8, 18,  4,  1, C.gold],
    [ 7, 19,  6,  1, C.gold],
    [ 6, 20,  8,  1, C.gold],
    [ 7, 21,  6,  1, C.gold],
    [ 8, 22,  4,  1, C.gold],
    [ 9, 23,  2,  1, C.gold],
    // Front card — face up A♠
    [14,  6, 12, 18, C.parchL],
    [14,  6, 12,  1, C.parchM],
    [14, 23, 12,  1, C.parchD],
    [25,  6,  1, 18, C.parchD],
    [14,  6,  1, 18, C.parchM],
    // big A
    [18, 11,  4,  1, C.ink],
    [17, 12,  6,  4, C.ink],
    [16, 14,  8,  2, C.ink],
    [19, 16,  2,  2, C.ink],
    // letter A
    [16, 18,  1,  3, C.ink],
    [22, 18,  1,  3, C.ink],
    [16, 18,  7,  1, C.ink],
    [16, 20,  7,  1, C.ink],
    // Chip stack on left bottom
    [ 2, 24,  8,  3, C.gold],
    [ 2, 24,  8,  1, C.goldL],
    [ 2, 27,  8,  3, C.crimson],
    [ 2, 27,  8,  1, C.neonCrim],
    [ 2, 23,  8,  1, C.crimsonD],
    [ 2, 30,  8,  1, C.shadow],
    // Chip top
    [ 3, 22,  6,  1, C.parchL],
    [ 3, 22,  6,  1, C.parchL],
    [ 4, 21,  4,  1, C.gold],
  ],

  // ----- Daily Spin — vertical wheel of fortune -----
  "lobby.daily_spin": [
    // Wheel rim
    [10,  3, 12, 1, C.goldD],
    [ 7,  4, 18, 1, C.goldD],
    [ 5,  5, 22, 1, C.goldD],
    [ 4,  6, 24, 1, C.goldD],
    [ 3,  7, 26, 18, C.goldD],
    [ 4, 25, 24, 1, C.goldD],
    [ 5, 26, 22, 1, C.goldD],
    [ 7, 27, 18, 1, C.goldD],
    [10, 28, 12, 1, C.goldD],
    // Wedges (4 colors)
    [11,  6, 10, 1, C.crimson],
    [ 8,  7, 16, 9, C.crimson],
    [ 5,  9, 22, 7, C.crimson],
    [ 4, 11, 24,  5, C.crimson],
    [11, 16, 10, 1, C.cactus],
    [ 8, 17, 16, 8, C.cactus],
    [ 5, 17, 22, 7, C.cactus],
    [ 4, 17, 24,  5, C.cactus],
    [ 4, 16, 12,  1, C.skyD],
    [ 4, 17, 12,  7, C.sky],
    [ 5, 21, 11,  4, C.sky],
    [ 7, 23, 9,  3, C.sky],
    [16,  7, 12,  1, C.gold],
    [16,  7, 12,  9, C.gold],
    [16,  8, 11,  8, C.gold],
    // Center hub
    [14, 14,  4,  4, C.ink],
    [15, 15,  2,  2, C.parchL],
    // Pointer at top
    [15,  1,  2,  4, C.ink],
    [14,  1,  4,  2, C.ink],
    [15,  2,  2,  3, C.crimson],
    [14,  4,  4,  1, C.crimsonD],
  ],

  // ----- Crossy Road — chicken hopping on striped road -----
  "lobby.crossy_road": [
    // Sky / grass stripe
    [ 0,  0, 32, 8, C.cactusL],
    [ 0,  4, 32, 1, C.cactus],
    // Road
    [ 0,  8, 32, 24, C.ink],
    [ 0, 28, 32,  1, C.shadow],
    // Lane stripes (dashed)
    [ 1, 15, 4, 2, C.parchL],
    [ 9, 15, 4, 2, C.parchL],
    [17, 15, 4, 2, C.parchL],
    [25, 15, 4, 2, C.parchL],
    [ 1, 23, 4, 2, C.gold],
    [ 9, 23, 4, 2, C.gold],
    [17, 23, 4, 2, C.gold],
    [25, 23, 4, 2, C.gold],
    // Chicken body (centered, mid-hop)
    [12, 11,  8,  6, C.parchL],
    [12, 11,  8,  1, C.parchM],
    [11, 12,  1,  4, C.parchL],
    [20, 12,  1,  4, C.parchL],
    // belly shadow
    [13, 16,  6,  1, C.parchD],
    // beak
    [20, 13,  3,  2, C.gold],
    [20, 14,  3,  1, C.goldD],
    // eye
    [17, 12,  2,  2, C.parchL],
    [18, 13,  1,  1, C.ink],
    // comb red
    [13,  9,  2,  1, C.crimson],
    [15,  9,  2,  1, C.crimson],
    [13, 10,  6,  1, C.crimson],
    // legs (dangling mid-hop)
    [13, 17,  2,  3, C.gold],
    [17, 17,  2,  3, C.gold],
    [12, 20,  3,  1, C.goldD],
    [16, 20,  3,  1, C.goldD],
    // Hop arc dots
    [ 6,  9, 1, 1, C.parchM],
    [ 8,  7, 1, 1, C.parchM],
    [10,  6, 1, 1, C.parchM],
  ],

  // ----- Flappy — bird between pipes -----
  "lobby.flappy": [
    // Sky
    [ 0,  0, 32, 28, C.skyL],
    // Ground
    [ 0, 28, 32,  4, C.saddle],
    [ 0, 28, 32,  1, C.saddleM],
    // Top pipe (left-tall)
    [ 4,  0,  8, 14, C.cactus],
    [ 4,  0,  1, 14, C.cactusD],
    [11,  0,  1, 14, C.cactusL],
    [ 4, 12, 8,  1, C.cactusD],
    [ 3, 12, 10, 4, C.cactus],
    [ 3, 12, 10, 1, C.cactusL],
    [ 3, 15, 10, 1, C.cactusD],
    // Bottom pipe (right-tall)
    [22, 18,  8, 14, C.cactus],
    [22, 18,  1, 14, C.cactusD],
    [29, 18,  1, 14, C.cactusL],
    [22, 18,  8,  1, C.cactusL],
    [21, 14, 10, 4, C.cactus],
    [21, 14, 10, 1, C.cactusL],
    [21, 17, 10, 1, C.cactusD],
    // Bird
    [14, 14,  6,  6, C.gold],
    [14, 14,  6,  1, C.goldL],
    [13, 15,  1,  4, C.gold],
    [20, 15,  1,  4, C.goldD],
    // belly white
    [15, 17,  4,  3, C.parchL],
    // beak
    [20, 16,  3,  2, C.crimson],
    [20, 17,  3,  1, C.crimsonD],
    // eye
    [18, 15,  2,  2, C.parchL],
    [19, 15,  1,  1, C.ink],
    // wing flap
    [12, 17,  2,  3, C.goldD],
    [11, 18,  1,  2, C.goldDD],
    // Cloud
    [ 5, 22,  4,  1, C.parchL],
    [ 4, 23,  6,  2, C.parchL],
    [22,  3,  4,  1, C.parchL],
    [21,  4,  6,  2, C.parchL],
  ],

  // ----- Monopoly — top hat on property card -----
  "lobby.monopoly": [
    // Card
    [ 4,  4, 24, 26, C.parchL],
    [ 4,  4, 24,  1, C.parchM],
    [ 4, 29, 24,  1, C.parchD],
    [ 4,  4,  1, 26, C.parchM],
    [27,  4,  1, 26, C.parchD],
    // Top color band (purple/crimson "owned" stripe)
    [ 4,  4, 24,  6, C.crimson],
    [ 4,  4, 24,  1, C.neonCrim],
    [ 4,  9, 24,  1, C.crimsonD],
    // Card title text marks
    [ 7, 11, 18, 1, C.ink],
    [ 7, 13,  8, 1, C.saddleD],
    [16, 13,  6, 1, C.saddleD],
    // Top hat (centered on card)
    [10, 14, 12, 9, C.ink],
    [10, 14, 12, 1, C.shadow],
    [21, 14,  1, 9, C.shadow],
    // Hat band (red)
    [10, 19, 12, 2, C.crimson],
    [10, 19, 12, 1, C.crimsonD],
    // Hat brim
    [ 7, 22, 18, 3, C.ink],
    [ 7, 22, 18, 1, C.shadow],
    [ 7, 25, 18, 1, C.shadow],
    // Hat shine
    [12, 15,  2, 4, C.inkSoft],
    // Dollar sign on card bottom
    [13, 26,  2,  1, C.cactusD],
    [11, 27,  6,  1, C.cactus],
    [13, 28,  2,  1, C.cactusD],
    [13, 27,  2,  1, C.cactus],
    [16, 27,  1,  1, C.cactus],
  ],
};

// Tile helpers for the icon definitions above.
function mineTile(x: number, y: number): Px[] {
  return [
    [x, y, 6, 6, C.saddle],
    [x, y, 6, 1, C.saddleM],
    [x, y + 5, 6, 1, C.shadow],
    [x, y, 1, 6, C.saddleM],
    [x + 5, y, 1, 6, C.saddleD],
    [x + 1, y + 1, 4, 4, C.saddle],
  ];
}
function pegRow(y: number, xs: number[]): Px[] {
  const out: Px[] = [];
  for (const x of xs) {
    out.push([x, y, 2, 2, C.gold]);
    out.push([x, y, 2, 1, C.goldL]);
    out.push([x, y + 1, 2, 1, C.goldDD]);
  }
  return out;
}

// 128-grid helper — a single 6×6 peg disc with bevel highlights.
function peg128(x: number, y: number): Px[] {
  return [
    [x,     y,     6, 6, C.goldDD],
    [x + 1, y + 1, 4, 4, C.gold],
    [x + 2, y + 2, 2, 2, C.neonGold],
    [x,     y,     6, 1, C.goldL],
    [x,     y + 5, 6, 1, C.shadow],
  ];
}

export function GameIcon({
  name,
  size = 24,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  // Dispatch by sprite resolution. Most lobby icons are 128×128 dioramas;
  // a few simpler ones live on the 32-grid; everything non-lobby uses the
  // original 16-grid sprite system.
  const big = LOBBY_ICONS_128[name as keyof typeof LOBBY_ICONS_128];
  if (big) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        shapeRendering="crispEdges"
        className={className}
        style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        aria-hidden
      >
        {big.map(([x, y, w, h, c], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
        ))}
      </svg>
    );
  }
  const lobbyRects = LOBBY_ICONS_32[name as keyof typeof LOBBY_ICONS_32];
  if (lobbyRects) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        shapeRendering="crispEdges"
        className={className}
        style={{ display: "inline-block", verticalAlign: "middle", ...style }}
        aria-hidden
      >
        {lobbyRects.map(([x, y, w, h, c], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
        ))}
      </svg>
    );
  }
  const rects = ICONS[name];
  if (!rects) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden
    >
      {rects.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
      ))}
    </svg>
  );
}
