import { randomInt } from "../rng";

// Western-themed symbols. Reel weights drive RTP (~94%).
export type SlotSymbol = "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF";

export const SYMBOLS: SlotSymbol[] = ["BOOT", "GUN", "STAR", "GOLD", "SHERIFF"];

// Higher weight = more common.
const WEIGHTS: Record<SlotSymbol, number> = {
  BOOT: 40,
  GUN: 30,
  STAR: 18,
  GOLD: 9,
  SHERIFF: 3,
};

// Three-of-a-kind multipliers.
const THREE_OF: Record<SlotSymbol, number> = {
  BOOT: 3,
  GUN: 6,
  STAR: 12,
  GOLD: 30,
  SHERIFF: 100,
};

// Two-of-a-kind (any pair on left two reels) multipliers — small consolation.
const TWO_OF: Record<SlotSymbol, number> = {
  BOOT: 0.5,
  GUN: 0.8,
  STAR: 1.2,
  GOLD: 2,
  SHERIFF: 5,
};

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

function spinReel(): SlotSymbol {
  let r = randomInt(0, TOTAL_WEIGHT);
  for (const s of SYMBOLS) {
    r -= WEIGHTS[s];
    if (r < 0) return s;
  }
  return "BOOT";
}

export type SlotsResult = {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  multiplier: number;
  payout: number;
  kind: "three" | "two" | "none";
  symbol: SlotSymbol | null;
};

export function spin(bet: number): SlotsResult {
  const reels: [SlotSymbol, SlotSymbol, SlotSymbol] = [spinReel(), spinReel(), spinReel()];
  let kind: SlotsResult["kind"] = "none";
  let symbol: SlotSymbol | null = null;
  let multiplier = 0;

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    kind = "three";
    symbol = reels[0];
    multiplier = THREE_OF[reels[0]];
  } else if (reels[0] === reels[1]) {
    kind = "two";
    symbol = reels[0];
    multiplier = TWO_OF[reels[0]];
  }

  const payout = Math.floor(bet * multiplier);
  return { reels, multiplier, payout, kind, symbol };
}

export const PAYTABLE = { THREE_OF, TWO_OF };
