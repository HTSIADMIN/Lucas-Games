import { Card, cardValue, freshDeck } from "../cards";

export type BlackjackStatus =
  | "player_turn"
  | "dealer_turn"
  | "player_bust"
  | "dealer_bust"
  | "player_blackjack"
  | "push"
  | "win"
  | "loss";

export type BlackjackState = {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  status: BlackjackStatus;
  bet: number;
  doubled: boolean;
};

export type HandValue = { total: number; soft: boolean };

export function handValue(hand: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    total += cardValue(c);
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand).total === 21;
}

export function startHand(bet: number): BlackjackState {
  const deck = freshDeck(2); // two-deck shoe per hand
  const player = [deck.pop()!, deck.pop()!];
  const dealer = [deck.pop()!, deck.pop()!];
  const state: BlackjackState = {
    deck,
    player,
    dealer,
    status: "player_turn",
    bet,
    doubled: false,
  };
  // Immediate blackjack resolution
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (pBJ && dBJ) state.status = "push";
  else if (pBJ) state.status = "player_blackjack";
  else if (dBJ) state.status = "loss";
  return state;
}

export function hit(state: BlackjackState): BlackjackState {
  if (state.status !== "player_turn") return state;
  const c = state.deck.pop();
  if (!c) return state;
  state.player.push(c);
  if (handValue(state.player).total > 21) state.status = "player_bust";
  return state;
}

/** Dealer plays out: hits until 17+ (stands on all 17s — soft and hard). */
export function dealerPlay(state: BlackjackState): BlackjackState {
  while (handValue(state.dealer).total < 17) {
    const c = state.deck.pop();
    if (!c) break;
    state.dealer.push(c);
  }
  const p = handValue(state.player).total;
  const d = handValue(state.dealer).total;
  if (d > 21) state.status = "dealer_bust";
  else if (p > d) state.status = "win";
  else if (p < d) state.status = "loss";
  else state.status = "push";
  return state;
}

export function stand(state: BlackjackState): BlackjackState {
  if (state.status !== "player_turn") return state;
  state.status = "dealer_turn";
  return dealerPlay(state);
}

export function doubleDown(state: BlackjackState): BlackjackState {
  if (state.status !== "player_turn") return state;
  if (state.player.length !== 2) return state;
  state.doubled = true;
  const c = state.deck.pop();
  if (!c) return state;
  state.player.push(c);
  if (handValue(state.player).total > 21) {
    state.status = "player_bust";
    return state;
  }
  state.status = "dealer_turn";
  return dealerPlay(state);
}

/** Returns payout (gross — bet already debited). Result interpretation:
 *   blackjack 3:2 → 2.5x bet
 *   win → 2x bet
 *   push → 1x bet (refund)
 *   loss / player_bust → 0
 * Doubled bets count both halves in the result.
 */
export function payoutFor(state: BlackjackState): number {
  const bet = state.doubled ? state.bet * 2 : state.bet;
  switch (state.status) {
    case "player_blackjack":
      return Math.floor(bet * 2.5);
    case "win":
    case "dealer_bust":
      return bet * 2;
    case "push":
      return bet;
    case "loss":
    case "player_bust":
      return 0;
    default:
      return 0;
  }
}

/** Total additional debit needed when doubling (the second half of the bet). */
export function doubleAdditional(state: BlackjackState): number {
  return state.bet;
}

export function isTerminal(s: BlackjackStatus): boolean {
  return s !== "player_turn" && s !== "dealer_turn";
}

/** Public payload — never expose `deck`. */
export function publicView(state: BlackjackState, hideHole: boolean) {
  return {
    player: state.player,
    dealer: hideHole && state.status === "player_turn"
      ? [state.dealer[0], { rank: "?", suit: "?" }]
      : state.dealer,
    playerTotal: handValue(state.player).total,
    dealerTotal:
      hideHole && state.status === "player_turn"
        ? cardValue(state.dealer[0])
        : handValue(state.dealer).total,
    status: state.status,
    bet: state.bet,
    doubled: state.doubled,
    canDouble: state.status === "player_turn" && state.player.length === 2,
  };
}
