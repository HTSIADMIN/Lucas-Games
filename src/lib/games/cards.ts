import { randomInt } from "./rng";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { rank: Rank; suit: Suit };

export const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const SUITS: Suit[] = ["spades","hearts","diamonds","clubs"];

export function freshDeck(decks = 1): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const r of RANKS) cards.push({ rank: r, suit: s });
  }
  return shuffle(cards);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardValue(c: Card): number {
  if (c.rank === "A") return 11;
  if (c.rank === "J" || c.rank === "Q" || c.rank === "K") return 10;
  return Number(c.rank);
}
