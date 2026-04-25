import { randInt } from "../rng";

// European single-zero wheel (better player odds than American 00).
export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function colorOf(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export type RouletteBetType =
  | "straight"   // value: 0..36
  | "red"
  | "black"
  | "even"
  | "odd"
  | "low"        // 1..18
  | "high"       // 19..36
  | "dozen"      // value: 1|2|3
  | "column";    // value: 1|2|3

export type RouletteBet = {
  type: RouletteBetType;
  value?: number; // required for straight/dozen/column
  amount: number;
};

export type RouletteSettleRow = {
  type: RouletteBetType;
  value?: number;
  amount: number;
  win: boolean;
  payout: number;
};

export type RouletteResult = {
  winning: number;
  color: "red" | "black" | "green";
  totalBet: number;
  totalPayout: number;
  rows: RouletteSettleRow[];
};

export function validateBet(b: RouletteBet): string | null {
  if (!Number.isInteger(b.amount) || b.amount < 100) return "bet_too_low";
  switch (b.type) {
    case "straight":
      if (!Number.isInteger(b.value) || (b.value as number) < 0 || (b.value as number) > 36) return "value_invalid";
      return null;
    case "dozen":
    case "column":
      if (b.value !== 1 && b.value !== 2 && b.value !== 3) return "value_invalid";
      return null;
    case "red":
    case "black":
    case "even":
    case "odd":
    case "low":
    case "high":
      return null;
    default:
      return "type_invalid";
  }
}

function settleOne(b: RouletteBet, n: number): RouletteSettleRow {
  let win = false;
  let multiplier = 0;
  switch (b.type) {
    case "straight":
      win = b.value === n;
      multiplier = 36; // 35:1 + stake back
      break;
    case "red":
      win = n !== 0 && colorOf(n) === "red";
      multiplier = 2;
      break;
    case "black":
      win = n !== 0 && colorOf(n) === "black";
      multiplier = 2;
      break;
    case "even":
      win = n !== 0 && n % 2 === 0;
      multiplier = 2;
      break;
    case "odd":
      win = n !== 0 && n % 2 === 1;
      multiplier = 2;
      break;
    case "low":
      win = n >= 1 && n <= 18;
      multiplier = 2;
      break;
    case "high":
      win = n >= 19 && n <= 36;
      multiplier = 2;
      break;
    case "dozen":
      if (n === 0) win = false;
      else {
        const dozen = Math.ceil(n / 12);
        win = dozen === b.value;
      }
      multiplier = 3;
      break;
    case "column":
      if (n === 0) win = false;
      else {
        // Column 1: 1, 4, 7, ... (n % 3 === 1)
        // Column 2: 2, 5, 8, ... (n % 3 === 2)
        // Column 3: 3, 6, 9, ... (n % 3 === 0)
        const col = n % 3 === 0 ? 3 : n % 3;
        win = col === b.value;
      }
      multiplier = 3;
      break;
  }
  return {
    type: b.type,
    value: b.value,
    amount: b.amount,
    win,
    payout: win ? b.amount * multiplier : 0,
  };
}

export function spin(bets: RouletteBet[]): RouletteResult {
  const winning = randInt(0, 36);
  const rows = bets.map((b) => settleOne(b, winning));
  const totalBet = bets.reduce((s, b) => s + b.amount, 0);
  const totalPayout = rows.reduce((s, r) => s + r.payout, 0);
  return { winning, color: colorOf(winning), totalBet, totalPayout, rows };
}
