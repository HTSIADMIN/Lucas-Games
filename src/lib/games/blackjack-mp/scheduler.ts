// Multiplayer Blackjack lazy scheduler.
//   betting (15s) → dealing → player_turn (15s/seat) → dealer_turn → settled → 7s cooldown → next
import { randomUUID } from "node:crypto";
import {
  getActiveBlackjackRound,
  insertBlackjackRound,
  listBlackjackSeats,
  updateBlackjackRound,
  updateBlackjackSeat,
  type BlackjackRound,
  type BlackjackSeat,
} from "@/lib/db";
import { credit, getBalance } from "@/lib/wallet";
import { freshDeck, cardValue, type Card } from "@/lib/games/cards";

export const BET_WINDOW_MS = 15_000;
export const ACTION_WINDOW_MS = 15_000;
export const COOLDOWN_AFTER_SETTLE_MS = 5_000;

function handTotal(hand: Card[]): number {
  let total = 0, aces = 0;
  for (const c of hand) { total += cardValue(c); if (c.rank === "A") aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handTotal(hand) === 21;
}

export type BlackjackStateView = {
  round: {
    id: string;
    roundNo: number;
    status: BlackjackRound["status"];
    betCloseAt: string | null;
    actionDeadlineAt: string | null;
    currentUserId: string | null;
    dealerHand: Card[];
    dealerHidden: boolean;
    dealerTotal: number | null;
  } | null;
  seats: Array<{
    userId: string;
    bet: number;
    hand: Card[];
    handTotal: number;
    status: BlackjackSeat["status"];
    doubled: boolean;
    payout: number;
  }>;
  serverNow: number;
};

export async function getBlackjackState(): Promise<BlackjackStateView> {
  const r = await advance();
  let seatsView: BlackjackStateView["seats"] = [];
  let dealerHand: Card[] = [];
  let dealerHidden = false;
  let dealerTotal: number | null = null;
  if (r) {
    const seats = await listBlackjackSeats(r.id);
    seatsView = seats.map((s) => ({
      userId: s.user_id,
      bet: s.bet,
      hand: s.hand as Card[],
      handTotal: handTotal(s.hand as Card[]),
      status: s.status,
      doubled: s.doubled,
      payout: s.payout,
    }));
    dealerHand = r.dealer_hand as Card[];
    // Hide dealer's second card while players are still acting
    dealerHidden = r.status === "player_turn" || r.status === "dealing";
    if (dealerHidden && dealerHand.length >= 2) {
      dealerHand = [dealerHand[0], { rank: "?", suit: "?" } as unknown as Card];
      dealerTotal = cardValue(r.dealer_hand[0] as Card);
    } else {
      dealerTotal = handTotal(r.dealer_hand as Card[]);
    }
  }
  return {
    round: r ? {
      id: r.id,
      roundNo: r.round_no,
      status: r.status,
      betCloseAt: r.bet_close_at,
      actionDeadlineAt: r.action_deadline_at,
      currentUserId: r.current_user_id,
      dealerHand,
      dealerHidden,
      dealerTotal,
    } : null,
    seats: seatsView,
    serverNow: Date.now(),
  };
}

async function advance(): Promise<BlackjackRound | null> {
  const now = Date.now();
  let r = await getActiveBlackjackRound();

  if (!r) return await maybeCreateNewRound(now);

  // betting → dealing
  if (r.status === "betting" && r.bet_close_at && now >= new Date(r.bet_close_at).getTime()) {
    const seats = await listBlackjackSeats(r.id);
    if (seats.length === 0) {
      // No bets placed — skip to settled-cooldown so a new round opens.
      r = (await updateBlackjackRound(r.id, { status: "settled", ended_at: new Date(now).toISOString() })) ?? r;
    } else {
      r = await dealHands(r, seats);
    }
  }

  // player_turn timer
  if (r && r.status === "player_turn" && r.action_deadline_at && now >= new Date(r.action_deadline_at).getTime()) {
    // Auto-stand current player and advance
    const seats = await listBlackjackSeats(r.id);
    const cur = seats.find((s) => s.user_id === r!.current_user_id);
    if (cur && cur.status === "playing") {
      await updateBlackjackSeat(cur.id, { status: "standing" });
    }
    r = await advanceTurn(r);
  }

  // settled cooldown over → new round
  if (r && r.status === "settled" && r.ended_at) {
    const cooldownDone = now >= new Date(r.ended_at).getTime() + COOLDOWN_AFTER_SETTLE_MS;
    if (cooldownDone) return await maybeCreateNewRound(now);
  }

  return r;
}

async function maybeCreateNewRound(now: number): Promise<BlackjackRound> {
  const id = randomUUID();
  const round: BlackjackRound = {
    id,
    round_no: 0,
    status: "betting",
    bet_close_at: new Date(now + BET_WINDOW_MS).toISOString(),
    action_deadline_at: null,
    current_user_id: null,
    dealer_hand: [],
    deck: freshDeck(2) as unknown as { rank: string; suit: string }[],
    started_at: null,
    ended_at: null,
    created_at: new Date(now).toISOString(),
  };
  return await insertBlackjackRound(round);
}

async function dealHands(round: BlackjackRound, seats: BlackjackSeat[]): Promise<BlackjackRound> {
  const deck = round.deck as Card[];
  // Deal 2 cards to each seat (in order), 2 to dealer.
  for (const s of seats) {
    const c1 = deck.pop()!, c2 = deck.pop()!;
    const hand = [c1, c2];
    const status: BlackjackSeat["status"] = isBlackjack(hand) ? "blackjack" : "playing";
    await updateBlackjackSeat(s.id, { hand, status });
  }
  const d1 = deck.pop()!, d2 = deck.pop()!;
  const dealer = [d1, d2];
  // First playing seat is the actor.
  const refreshed = await listBlackjackSeats(round.id);
  const firstActor = refreshed.find((s) => s.status === "playing");
  let updated: Partial<BlackjackRound>;
  if (!firstActor) {
    // All blackjacks; jump straight to dealer turn (which then settles).
    updated = {
      status: "dealer_turn",
      dealer_hand: dealer,
      deck: deck as unknown as { rank: string; suit: string }[],
      started_at: new Date().toISOString(),
    };
    const newRound = (await updateBlackjackRound(round.id, updated)) ?? round;
    return await runDealerAndSettle(newRound, refreshed);
  } else {
    updated = {
      status: "player_turn",
      dealer_hand: dealer,
      deck: deck as unknown as { rank: string; suit: string }[],
      started_at: new Date().toISOString(),
      current_user_id: firstActor.user_id,
      action_deadline_at: new Date(Date.now() + ACTION_WINDOW_MS).toISOString(),
    };
    return (await updateBlackjackRound(round.id, updated)) ?? round;
  }
}

export async function advanceTurn(round: BlackjackRound): Promise<BlackjackRound> {
  const seats = await listBlackjackSeats(round.id);
  const i = seats.findIndex((s) => s.user_id === round.current_user_id);
  // Find next seat with status='playing'.
  for (let j = i + 1; j < seats.length; j++) {
    if (seats[j].status === "playing") {
      const upd = (await updateBlackjackRound(round.id, {
        current_user_id: seats[j].user_id,
        action_deadline_at: new Date(Date.now() + ACTION_WINDOW_MS).toISOString(),
      })) ?? round;
      return upd;
    }
  }
  // No more players → dealer turn
  const upd = (await updateBlackjackRound(round.id, {
    status: "dealer_turn",
    current_user_id: null,
    action_deadline_at: null,
  })) ?? round;
  return await runDealerAndSettle(upd, seats);
}

async function runDealerAndSettle(round: BlackjackRound, seats: BlackjackSeat[]): Promise<BlackjackRound> {
  // Re-fetch to get the latest deck.
  const live = (await import("@/lib/db")).getBlackjackRound;
  const fresh = (await live(round.id)) ?? round;
  const deck = fresh.deck as Card[];
  const dealer = [...(fresh.dealer_hand as Card[])];

  // Only play dealer if any seat survived (not all busted).
  const anyAlive = seats.some((s) => s.status === "standing" || s.status === "blackjack");
  if (anyAlive) {
    while (handTotal(dealer) < 17) {
      const c = deck.pop();
      if (!c) break;
      dealer.push(c);
    }
  }
  const dTotal = handTotal(dealer);
  const dBust = dTotal > 21;

  for (const s of seats) {
    let payout = 0;
    if (s.status === "blackjack") {
      // 3:2 unless dealer also blackjack → push
      if (isBlackjack(dealer)) payout = s.bet; // push
      else payout = Math.floor(s.bet * 2.5);
    } else if (s.status === "standing") {
      const pTotal = handTotal(s.hand as Card[]);
      const stake = s.doubled ? s.bet * 2 : s.bet;
      if (dBust || pTotal > dTotal) payout = stake * 2;
      else if (pTotal === dTotal) payout = stake;
      else payout = 0;
    } else if (s.status === "busted") {
      payout = 0; // already lost (bet was debited at place-bet time)
    }

    if (payout > 0) {
      await credit({
        userId: s.user_id,
        amount: payout,
        reason: "blackjack_settle",
        refKind: "blackjack",
        refId: `${round.id}:${s.user_id}:settle`,
      });
    }
    await updateBlackjackSeat(s.id, { status: "done", payout });
    // Bets feed
    const { insertGameSession } = await import("@/lib/db");
    const stake = s.doubled ? s.bet * 2 : s.bet;
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user_id,
      game: "blackjack",
      bet: stake,
      payout,
      state: { multiplayer: true, round_id: round.id, hand: s.hand, doubled: s.doubled },
      status: "settled",
    });
  }

  const finalRound = (await updateBlackjackRound(round.id, {
    status: "settled",
    dealer_hand: dealer,
    deck: deck as unknown as { rank: string; suit: string }[],
    ended_at: new Date().toISOString(),
  })) ?? round;
  return finalRound;
}

export { handTotal, isBlackjack };
