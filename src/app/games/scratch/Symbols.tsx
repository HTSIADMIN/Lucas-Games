// Pixel-art symbols for the scratch ticket. 16×16 grid, hand-laid
// rectangles, shape-rendering=crispEdges so they stay crisp at any
// scale.

import type { ScratchSymbol } from "@/lib/games/scratch/engine";

type Px = [x: number, y: number, w: number, h: number, color: string];

const C = {
  ink:      "#1a0f08",
  inkSoft:  "#3d2418",
  saddleD:  "#4a2818",
  saddle:   "#6b3f24",
  saddleM:  "#a87545",
  saddleL:  "#d4a574",
  parchL:   "#fef6e4",
  parchM:   "#fbe9c4",
  goldL:    "#ffe9a8",
  gold:     "#f5c842",
  goldD:    "#c8941d",
  goldDD:   "#7a5510",
  crimson:  "#e05a3c",
  crimsonD: "#8b3a3a",
  crimsonDD:"#4a1a1a",
  cactus:   "#6ba84f",
  cactusD:  "#3d6b2e",
  cactusL:  "#b8d99a",
  silver:   "#c4c4c4",
  silverD:  "#7d7d7d",
  whiteY:   "#fff8e1",
  amber:    "#b07020",
};

const SPRITES: Record<ScratchSymbol, Px[]> = {
  // Horseshoe — U-shape, saddle brown
  horseshoe: [
    [4, 3, 2, 1, C.saddleD], [10, 3, 2, 1, C.saddleD],
    [3, 4, 3, 2, C.saddle],  [10, 4, 3, 2, C.saddle],
    [3, 6, 2, 4, C.saddle],  [11, 6, 2, 4, C.saddle],
    [3, 10, 2, 2, C.saddleD], [11, 10, 2, 2, C.saddleD],
    [4, 12, 8, 1, C.saddle],
    [5, 13, 6, 1, C.saddleD],
    // nail dots
    [4, 5, 1, 1, C.ink], [11, 5, 1, 1, C.ink],
    [4, 8, 1, 1, C.ink], [11, 8, 1, 1, C.ink],
    [5, 12, 1, 1, C.ink], [10, 12, 1, 1, C.ink],
    // highlights
    [4, 4, 1, 1, C.saddleM], [11, 4, 1, 1, C.saddleM],
  ],

  // Boot — cowboy boot (re-using the slot.boot silhouette, simplified)
  boot: [
    [6, 2, 4, 1, C.saddle],
    [5, 3, 5, 5, C.saddle],
    [3, 8, 9, 1, C.saddle],
    [3, 9, 10, 2, C.saddleD],
    [2, 11, 11, 1, C.ink],
    [6, 3, 1, 4, C.saddleL],
    [11, 9, 2, 1, C.gold],
    [11, 10, 2, 1, C.goldD],
  ],

  // Ace of spades — black spade on white card
  ace: [
    // card
    [3, 2, 10, 12, C.parchL],
    [3, 2, 10, 1, C.ink], [3, 13, 10, 1, C.ink],
    [3, 2, 1, 12, C.ink], [12, 2, 1, 12, C.ink],
    // spade
    [7, 4, 2, 1, C.ink],
    [6, 5, 4, 1, C.ink],
    [5, 6, 6, 2, C.ink],
    [4, 8, 8, 1, C.ink],
    [5, 9, 6, 1, C.ink],
    [7, 10, 2, 1, C.ink],
    [7, 11, 2, 2, C.ink],
    [6, 12, 4, 1, C.ink],
    // A
    [4, 3, 1, 1, C.ink],
    [12, 12, 1, 1, C.ink],
  ],

  // Dice — single die showing five
  dice: [
    [3, 3, 10, 10, C.parchL],
    [3, 3, 10, 1, C.ink], [3, 12, 10, 1, C.ink],
    [3, 3, 1, 10, C.ink], [12, 3, 1, 10, C.ink],
    [4, 4, 1, 1, C.parchM], // shading
    [11, 4, 1, 8, C.parchM],
    [4, 11, 7, 1, C.parchM],
    // pips
    [5, 5, 2, 2, C.ink],
    [9, 5, 2, 2, C.ink],
    [7, 7, 2, 2, C.ink],
    [5, 9, 2, 2, C.ink],
    [9, 9, 2, 2, C.ink],
  ],

  // Revolver — six-shooter
  revolver: [
    [2, 7, 9, 2, C.ink],
    [2, 7, 9, 1, C.inkSoft],
    [10, 6, 3, 1, C.ink],   // sight
    [11, 5, 1, 1, C.ink],
    [4, 9, 1, 3, C.ink],    // grip top
    [3, 10, 1, 4, C.saddleD], // grip wood
    [4, 11, 2, 3, C.saddle],
    [4, 14, 2, 1, C.saddleD],
    // cylinder
    [6, 6, 4, 4, C.ink],
    [7, 7, 2, 2, C.silverD],
    [7, 8, 1, 1, C.ink],
    // muzzle
    [12, 7, 1, 2, C.silver],
  ],

  // Whiskey bottle — amber bottle with label
  whiskey: [
    [7, 1, 2, 2, C.ink],     // cork
    [7, 3, 2, 1, C.saddleD], // cap
    [6, 4, 4, 1, C.amber],   // neck
    [5, 5, 6, 9, C.amber],   // body
    [5, 5, 6, 1, C.saddleD], // top edge
    [5, 13, 6, 1, C.saddleD],// bottom edge
    [10, 5, 1, 9, C.saddle], // shadow
    // label
    [6, 8, 4, 3, C.parchL],
    [6, 8, 4, 1, C.ink],
    [6, 10, 4, 1, C.ink],
    [7, 9, 2, 1, C.crimsonD],
    [5, 6, 1, 2, C.gold],    // highlight
  ],

  // Cactus — saguaro
  cactus: [
    [7, 2, 2, 12, C.cactusD],
    [6, 3, 1, 11, C.cactus],
    [9, 3, 1, 11, C.cactus],
    // arms
    [4, 6, 2, 1, C.cactusD],
    [3, 7, 2, 4, C.cactusD],
    [4, 11, 1, 1, C.cactusD],
    [10, 5, 2, 1, C.cactusD],
    [11, 6, 2, 4, C.cactusD],
    [11, 10, 1, 1, C.cactusD],
    // highlights
    [7, 3, 1, 9, C.cactusL],
    [4, 8, 1, 2, C.cactusL],
    [11, 7, 1, 2, C.cactusL],
    // base shadow
    [5, 14, 6, 1, C.ink],
  ],

  // Gold nugget — gold blob with sparkle
  gold: [
    [5, 5, 6, 1, C.goldD],
    [4, 6, 8, 1, C.goldD],
    [3, 7, 10, 4, C.gold],
    [4, 11, 8, 1, C.goldD],
    [5, 12, 6, 1, C.goldDD],
    // highlights
    [4, 7, 2, 1, C.goldL],
    [10, 7, 2, 1, C.goldL],
    [5, 8, 1, 1, C.whiteY],
    [11, 9, 1, 1, C.whiteY],
    // sparkle
    [13, 4, 1, 3, C.whiteY],
    [12, 5, 3, 1, C.whiteY],
  ],

  // Sheriff star — 5-point star, gold with red center
  sheriff: [
    [7, 2, 2, 2, C.gold],   // top
    [6, 4, 4, 1, C.gold],
    [5, 5, 6, 2, C.gold],
    [3, 7, 10, 2, C.gold],
    [4, 9, 8, 2, C.gold],
    [5, 11, 2, 2, C.gold],   // bottom-left point
    [9, 11, 2, 2, C.gold],   // bottom-right point
    [6, 13, 1, 1, C.gold],
    [9, 13, 1, 1, C.gold],
    // highlights
    [5, 7, 1, 1, C.goldL],
    [10, 7, 1, 1, C.goldL],
    [7, 4, 1, 1, C.goldL],
    // center mark
    [7, 8, 2, 1, C.crimsonD],
  ],

  // Dynamite — wild (reserved for v3)
  dynamite: [
    [4, 6, 8, 6, C.crimson],
    [4, 6, 8, 1, C.crimsonDD],
    [4, 11, 8, 1, C.crimsonDD],
    [4, 7, 1, 4, C.crimsonD],
    [11, 7, 1, 4, C.crimsonD],
    [6, 8, 4, 2, C.parchL],   // label
    [7, 5, 1, 1, C.saddleD],   // fuse
    [7, 4, 1, 1, C.saddleD],
    [8, 3, 1, 1, C.saddleD],
    [9, 2, 1, 1, C.gold],      // spark
    [10, 1, 1, 1, C.goldL],
  ],

  // Bandit mask — instant lose (reserved for v3)
  bandit: [
    [3, 5, 10, 4, C.ink],
    [3, 5, 10, 1, C.inkSoft],
    [5, 7, 2, 1, C.parchL],
    [9, 7, 2, 1, C.parchL],
    [5, 7, 1, 1, C.ink],
    [10, 7, 1, 1, C.ink],
    [3, 9, 1, 2, C.ink],
    [12, 9, 1, 2, C.ink],
    [4, 5, 1, 1, C.ink],
    [11, 5, 1, 1, C.ink],
  ],
};

export function ScratchSym({ name, size = 32 }: { name: ScratchSymbol; size?: number }) {
  const rects = SPRITES[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{ display: "block" }}
      aria-hidden
    >
      {rects.map(([x, y, w, h, color], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={color} />
      ))}
    </svg>
  );
}
