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

const ICONS: Record<IconName, Px[]> = {
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

  // ============ LOBBY TILE ART ============
  // COINFLIP — single big coin spinning edge
  "lobby.coinflip": [
    [5, 2, 6, 1, C.goldD],
    [3, 3, 10, 1, C.goldD],
    [2, 4, 12, 8, C.gold],
    [3, 12, 10, 1, C.goldD],
    [5, 13, 6, 1, C.goldDD],
    [2, 4, 1, 8, C.goldD],
    [13, 4, 1, 8, C.goldD],
    // dollar sign center
    [7, 5, 2, 1, C.ink],
    [6, 6, 1, 1, C.ink],
    [7, 7, 2, 1, C.ink],
    [9, 8, 1, 2, C.ink],
    [7, 10, 2, 1, C.ink],
    [7, 4, 2, 1, C.ink],
    [7, 11, 2, 1, C.ink],
    // shine
    [3, 5, 2, 1, C.neonGold],
    [4, 4, 1, 1, C.neonGold],
  ],

  // COINFLIP DUEL — two crossed coins
  "lobby.coinflip_duel": [
    // back coin (slightly smaller, top-left)
    [1, 1, 7, 1, C.goldD],
    [0, 2, 9, 5, C.gold],
    [1, 7, 7, 1, C.goldD],
    [4, 3, 1, 4, C.ink],
    [3, 4, 1, 1, C.ink],
    [3, 5, 1, 1, C.ink],
    // front coin (bottom-right)
    [8, 8, 7, 1, C.goldD],
    [7, 9, 9, 5, C.gold],
    [8, 14, 7, 1, C.goldD],
    [11, 10, 1, 4, C.ink],
    [10, 11, 1, 1, C.ink],
    [10, 12, 1, 1, C.ink],
    // shines
    [1, 3, 1, 1, C.neonGold],
    [8, 10, 1, 1, C.neonGold],
  ],

  // DICE — two pip dice
  "lobby.dice": [
    // die 1 (back)
    [1, 1, 8, 8, C.parchL],
    [1, 1, 8, 1, C.parchM],
    [1, 8, 8, 1, C.parchD],
    [1, 1, 1, 8, C.parchD],
    [8, 1, 1, 8, C.parchD],
    // pips on die 1 (showing 5)
    [3, 3, 1, 1, C.ink],
    [6, 3, 1, 1, C.ink],
    [4, 4, 1, 1, C.ink],
    [3, 6, 1, 1, C.ink],
    [6, 6, 1, 1, C.ink],
    // die 2 (front, offset)
    [7, 7, 8, 8, C.crimson],
    [7, 7, 8, 1, C.neonCrim],
    [7, 14, 8, 1, C.crimsonD],
    [7, 7, 1, 8, C.crimsonD],
    [14, 7, 1, 8, C.crimsonD],
    // pips on die 2 (showing 3)
    [9, 9, 1, 1, C.parchL],
    [11, 11, 1, 1, C.parchL],
    [13, 13, 1, 1, C.parchL],
  ],

  // SLOTS — slot machine
  "lobby.slots": [
    // body
    [2, 2, 12, 12, C.crimsonD],
    [2, 2, 12, 1, C.crimson],
    [2, 13, 12, 1, C.crimsonDD],
    [2, 2, 1, 12, C.crimson],
    [13, 2, 1, 12, C.crimsonDD],
    // screen
    [3, 4, 10, 6, C.ink],
    // reels
    [4, 5, 2, 4, C.parchL],
    [7, 5, 2, 4, C.parchL],
    [10, 5, 2, 4, C.parchL],
    // symbols
    [4, 6, 2, 1, C.crimson],
    [7, 6, 2, 1, C.gold],
    [10, 6, 2, 1, C.cactus],
    // lever
    [14, 4, 1, 4, C.goldD],
    [14, 3, 2, 1, C.gold],
    // coin tray
    [4, 11, 8, 1, C.gold],
    [5, 12, 6, 1, C.goldD],
  ],

  // BLACKJACK — A and K cards fanned
  "lobby.blackjack": [
    // back card (K)
    [2, 3, 6, 10, C.parchL],
    [2, 3, 6, 1, C.parchD],
    [2, 12, 6, 1, C.parchD],
    [2, 3, 1, 10, C.parchD],
    [7, 3, 1, 10, C.parchD],
    [3, 5, 1, 1, C.ink],
    [4, 4, 1, 1, C.ink],
    [4, 6, 1, 1, C.ink],
    [5, 5, 1, 1, C.ink],
    // K letter
    [3, 9, 1, 3, C.ink],
    [5, 9, 1, 1, C.ink],
    [6, 10, 1, 1, C.ink],
    [5, 11, 1, 1, C.ink],
    // front card (A) — slightly to right and up
    [8, 2, 6, 10, C.parchL],
    [8, 2, 6, 1, C.parchD],
    [8, 11, 6, 1, C.parchD],
    [8, 2, 1, 10, C.parchD],
    [13, 2, 1, 10, C.parchD],
    // big A spade
    [10, 4, 2, 1, C.ink],
    [9, 5, 4, 2, C.ink],
    [10, 7, 2, 1, C.ink],
    [9, 7, 1, 1, C.ink],
    [12, 7, 1, 1, C.ink],
    // letter A
    [9, 9, 1, 2, C.ink],
    [11, 9, 1, 2, C.ink],
    [9, 9, 3, 1, C.ink],
    [9, 10, 3, 1, C.ink],
  ],

  // ROULETTE — wheel from above
  "lobby.roulette": [
    // outer ring
    [5, 1, 6, 1, C.saddleD],
    [3, 2, 10, 1, C.saddleD],
    [2, 3, 12, 1, C.saddleD],
    [1, 4, 14, 8, C.saddleD],
    [2, 12, 12, 1, C.saddleD],
    [3, 13, 10, 1, C.saddleD],
    [5, 14, 6, 1, C.saddleD],
    // inner red/black/red
    [3, 4, 4, 7, C.crimsonDD],
    [7, 4, 2, 7, C.ink],
    [9, 4, 4, 7, C.crimsonDD],
    // hub
    [6, 6, 4, 4, C.gold],
    [7, 7, 2, 2, C.neonGold],
    // ball
    [11, 5, 1, 1, C.parchL],
  ],

  // MINES — grid of squares with one bomb
  "lobby.mines": [
    // 4x4 grid
    [1, 1, 14, 14, C.saddleD],
    // tiles
    [2, 2, 3, 3, C.parchM],
    [6, 2, 3, 3, C.parchM],
    [10, 2, 3, 3, C.parchM],
    [2, 6, 3, 3, C.parchM],
    [6, 6, 3, 3, C.ink],
    [10, 6, 3, 3, C.parchM],
    [2, 10, 3, 3, C.parchM],
    [6, 10, 3, 3, C.parchM],
    [10, 10, 3, 3, C.parchM],
    // bomb in center tile
    [7, 7, 1, 1, C.crimson],
    [7, 7, 1, 1, C.neonCrim],
    // gem on top-right
    [11, 3, 1, 1, C.cactusL],
    [11, 4, 1, 1, C.cactusD],
  ],

  // PLINKO — board with peg dots and ball
  "lobby.plinko": [
    // background
    [1, 1, 14, 14, C.saddleD],
    [2, 2, 12, 12, C.parchM],
    // pegs (rows of small dots)
    [4, 4, 1, 1, C.ink],
    [8, 4, 1, 1, C.ink],
    [12, 4, 1, 1, C.ink],
    [3, 7, 1, 1, C.ink],
    [6, 7, 1, 1, C.ink],
    [10, 7, 1, 1, C.ink],
    [13, 7, 1, 1, C.ink],
    [4, 10, 1, 1, C.ink],
    [8, 10, 1, 1, C.ink],
    [12, 10, 1, 1, C.ink],
    // ball
    [7, 3, 2, 1, C.gold],
    [7, 2, 2, 1, C.neonGold],
    // bottom buckets
    [2, 13, 4, 1, C.gold],
    [6, 13, 4, 1, C.crimson],
    [10, 13, 4, 1, C.gold],
  ],

  // CRASH — rocket on rising line
  "lobby.crash": [
    // rising line
    [1, 13, 2, 1, C.crimson],
    [3, 12, 2, 1, C.crimson],
    [5, 11, 2, 1, C.crimson],
    [7, 9, 2, 1, C.crimson],
    [9, 7, 2, 1, C.crimson],
    [11, 5, 2, 1, C.crimson],
    // rocket body
    [11, 2, 3, 4, C.parchL],
    [11, 2, 1, 4, C.parchD],
    // rocket nose
    [12, 1, 1, 1, C.crimson],
    // rocket fins
    [10, 5, 1, 2, C.crimsonD],
    [14, 5, 1, 2, C.crimsonD],
    // window
    [12, 3, 1, 1, C.sky],
    // exhaust
    [11, 6, 3, 1, C.gold],
    [12, 7, 1, 1, C.neonGold],
  ],

  // POKER — chip + cards
  "lobby.poker": [
    // chip behind
    [1, 6, 7, 1, C.crimsonD],
    [0, 7, 9, 5, C.crimson],
    [1, 12, 7, 1, C.crimsonD],
    [3, 8, 3, 3, C.parchL],
    [4, 9, 1, 1, C.crimson],
    // cards (small fan)
    [9, 2, 5, 8, C.parchL],
    [9, 2, 5, 1, C.parchD],
    [9, 9, 5, 1, C.parchD],
    [9, 2, 1, 8, C.parchD],
    [13, 2, 1, 8, C.parchD],
    // heart on card
    [10, 4, 1, 1, C.crimson],
    [12, 4, 1, 1, C.crimson],
    [10, 5, 3, 1, C.crimson],
    [11, 6, 1, 1, C.crimson],
  ],

  // DAILY SPIN — wheel of fortune
  "lobby.daily_spin": [
    // wheel rim
    [5, 1, 6, 1, C.gold],
    [3, 2, 10, 1, C.gold],
    [2, 3, 12, 9, C.gold],
    [3, 12, 10, 1, C.gold],
    [5, 13, 6, 1, C.gold],
    // wedges
    [3, 3, 5, 5, C.crimson],
    [8, 3, 5, 5, C.cactus],
    [3, 8, 5, 4, C.sky],
    [8, 8, 5, 4, C.crimsonD],
    // hub
    [7, 7, 2, 2, C.ink],
    // pointer (top)
    [7, 0, 2, 2, C.ink],
  ],

  // CROSSY ROAD — chicken on stripes
  "lobby.crossy_road": [
    // road stripes
    [0, 12, 16, 1, C.ink],
    [0, 14, 16, 1, C.ink],
    [0, 13, 2, 1, C.parchL],
    [4, 13, 2, 1, C.parchL],
    [8, 13, 2, 1, C.parchL],
    [12, 13, 2, 1, C.parchL],
    // chicken body
    [6, 6, 4, 4, C.parchL],
    [7, 5, 2, 1, C.parchL],
    // beak
    [10, 7, 1, 1, C.gold],
    // eye
    [8, 6, 1, 1, C.ink],
    // comb
    [7, 4, 1, 1, C.crimson],
    [8, 4, 1, 1, C.crimson],
    // legs
    [7, 10, 1, 2, C.gold],
    [9, 10, 1, 2, C.gold],
  ],

  // FLAPPY — bird with wings out
  "lobby.flappy": [
    // body
    [5, 5, 6, 6, C.gold],
    [4, 6, 1, 4, C.gold],
    [11, 6, 1, 4, C.gold],
    // belly
    [6, 8, 4, 2, C.parchL],
    // beak
    [11, 7, 2, 2, C.crimson],
    // eye
    [9, 6, 1, 1, C.parchL],
    [9, 6, 1, 1, C.ink],
    // wing
    [3, 7, 2, 3, C.goldD],
    // legs
    [6, 11, 1, 2, C.crimson],
    [9, 11, 1, 2, C.crimson],
    // pipe (right)
    [13, 0, 3, 5, C.cactus],
    [13, 11, 3, 5, C.cactus],
    [13, 5, 3, 1, C.cactusD],
    [13, 10, 3, 1, C.cactusD],
  ],

  // MONOPOLY — top hat on a property card
  "lobby.monopoly": [
    // card
    [2, 3, 12, 11, C.parchL],
    [2, 3, 12, 1, C.crimson],
    [2, 13, 12, 1, C.parchD],
    [2, 3, 1, 11, C.parchD],
    [13, 3, 1, 11, C.parchD],
    // top hat
    [6, 6, 4, 4, C.ink],
    [5, 9, 6, 1, C.ink],
    [4, 10, 8, 1, C.ink],
    // hat band
    [6, 8, 4, 1, C.crimson],
    // dollar
    [7, 11, 1, 2, C.cactusD],
    [6, 12, 3, 1, C.cactusD],
  ],
};

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
