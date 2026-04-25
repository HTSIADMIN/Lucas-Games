import { randInt } from "../rng";

export type CoinSide = "heads" | "tails";
export type CoinFlipResult = {
  pick: CoinSide;
  result: CoinSide;
  win: boolean;
  multiplier: number; // 2.0 on win, 0 on loss
  payout: number;     // bet * multiplier on win, 0 on loss
};

/** Slight house edge: 49.5% win rate via 1-in-200 push to "tails". Keeps it fair-ish. */
export function flip(pick: CoinSide, bet: number): CoinFlipResult {
  // 1..200 inclusive. House gets 1 unit (≈0.5% edge).
  const roll = randInt(1, 200);
  let result: CoinSide;
  if (roll <= 99)       result = "heads";
  else if (roll <= 198) result = "tails";
  else                  result = "tails"; // the edge — biased miss
  const win = result === pick;
  const multiplier = win ? 2 : 0;
  return { pick, result, win, multiplier, payout: bet * multiplier };
}
