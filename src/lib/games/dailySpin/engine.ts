import { randInt } from "../rng";

export type SpinSlice = { amount: number; weight: number; label: string; tone: "low" | "mid" | "high" | "jackpot" };

// 8 slices around the wheel.
export const SLICES: SpinSlice[] = [
  { amount:  50_000, weight: 30, label: "50K",   tone: "low" },
  { amount: 100_000, weight: 24, label: "100K",  tone: "low" },
  { amount:  75_000, weight: 18, label: "75K",   tone: "low" },
  { amount: 200_000, weight: 12, label: "200K",  tone: "mid" },
  { amount: 350_000, weight: 8,  label: "350K",  tone: "mid" },
  { amount: 500_000, weight: 5,  label: "500K",  tone: "high" },
  { amount: 750_000, weight: 2,  label: "750K",  tone: "high" },
  { amount:1_000_000,weight: 1,  label: "1M",    tone: "jackpot" },
];

const TOTAL = SLICES.reduce((s, x) => s + x.weight, 0);

export type SpinResult = { sliceIndex: number; amount: number; label: string };

export function spinWheel(): SpinResult {
  let r = randInt(0, TOTAL - 1);
  for (let i = 0; i < SLICES.length; i++) {
    r -= SLICES[i].weight;
    if (r < 0) return { sliceIndex: i, amount: SLICES[i].amount, label: SLICES[i].label };
  }
  return { sliceIndex: 0, amount: SLICES[0].amount, label: SLICES[0].label };
}

export const COOLDOWN_HOURS = 24;
