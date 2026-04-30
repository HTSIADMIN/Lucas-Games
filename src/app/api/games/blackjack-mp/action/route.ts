import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { debit, getBalance } from "@/lib/wallet";
import {
  getActiveBlackjackRound,
  insertBlackjackSeat,
  listBlackjackSeats,
  updateBlackjackRound,
  updateBlackjackSeat,
} from "@/lib/db";
import { ACTION_WINDOW_MS, advanceTurn, handTotal, getBlackjackState } from "@/lib/games/blackjack-mp/scheduler";
import { cardValue, type Card } from "@/lib/games/cards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: "hit" | "stand" | "double" | "split" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  // Advance any stale state (timer expirations, etc.).
  await getBlackjackState();

  const round = await getActiveBlackjackRound();
  if (!round) return NextResponse.json({ error: "no_round" }, { status: 400 });
  if (round.status !== "player_turn") return NextResponse.json({ error: "not_player_turn" }, { status: 400 });
  if (round.current_user_id !== s.user.id) return NextResponse.json({ error: "not_your_turn" }, { status: 400 });

  // After splitting, a single user may have multiple seats — pick the
  // currently-playing one (status='playing'). Seats are id-ordered, so the
  // first 'playing' seat is the natural next.
  const seats = await listBlackjackSeats(round.id);
  const seat = seats.find((x) => x.user_id === s.user.id && x.status === "playing");
  if (!seat) return NextResponse.json({ error: "no_active_seat" }, { status: 400 });

  const deck = round.deck as Card[];
  const hand = (seat.hand as Card[]).slice();

  if (body.action === "hit") {
    const c = deck.pop();
    if (c) hand.push(c);
    const total = handTotal(hand);
    if (total > 21) {
      await updateBlackjackSeat(seat.id, { hand, status: "busted" });
      await updateBlackjackRound(round.id, { deck: deck as unknown as { rank: string; suit: string }[] });
      const fresh = (await getActiveBlackjackRound())!;
      await advanceTurn(fresh);
    } else {
      await updateBlackjackSeat(seat.id, { hand });
      await updateBlackjackRound(round.id, {
        deck: deck as unknown as { rank: string; suit: string }[],
        action_deadline_at: new Date(Date.now() + ACTION_WINDOW_MS).toISOString(),
      });
    }

  } else if (body.action === "stand") {
    await updateBlackjackSeat(seat.id, { status: "standing" });
    const fresh = (await getActiveBlackjackRound())!;
    await advanceTurn(fresh);

  } else if (body.action === "double") {
    // Allow double on any 2-card hand (including post-split hands).
    if (seat.hand.length !== 2) return NextResponse.json({ error: "cant_double" }, { status: 400 });
    try {
      await debit({
        userId: s.user.id,
        amount: seat.bet,
        reason: "blackjack_double",
        refKind: "blackjack",
        refId: `${round.id}:${seat.id}:double`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const c = deck.pop();
    if (c) hand.push(c);
    const total = handTotal(hand);
    const newStatus = total > 21 ? "busted" : "standing";
    await updateBlackjackSeat(seat.id, { hand, doubled: true, status: newStatus });
    await updateBlackjackRound(round.id, { deck: deck as unknown as { rank: string; suit: string }[] });
    const fresh = (await getActiveBlackjackRound())!;
    await advanceTurn(fresh);

  } else if (body.action === "split") {
    if (hand.length !== 2) return NextResponse.json({ error: "cant_split" }, { status: 400 });
    if (cardValue(hand[0] as Card) !== cardValue(hand[1] as Card)) {
      return NextResponse.json({ error: "cant_split" }, { status: 400 });
    }
    try {
      await debit({
        userId: s.user.id,
        amount: seat.bet,
        reason: "blackjack_split",
        refKind: "blackjack",
        refId: `${round.id}:${seat.id}:split`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const firstCard = hand[0] as Card;
    const secondCard = hand[1] as Card;
    const drawA = deck.pop();
    const drawB = deck.pop();
    if (!drawA || !drawB) return NextResponse.json({ error: "deck_empty" }, { status: 500 });

    // Standard rule: split aces draw exactly one card each, then auto-stand.
    const isAces = firstCard.rank === "A";
    const handA = [firstCard, drawA];
    const handB = [secondCard, drawB];
    const statusA: "playing" | "standing" | "blackjack" =
      handTotal(handA) === 21 ? "blackjack" : isAces ? "standing" : "playing";
    const statusB: "playing" | "standing" | "blackjack" =
      handTotal(handB) === 21 ? "blackjack" : isAces ? "standing" : "playing";

    await updateBlackjackSeat(seat.id, { hand: handA, status: statusA });
    await insertBlackjackSeat({
      round_id: round.id,
      user_id: s.user.id,
      bet: seat.bet,
      hand: handB,
      status: statusB,
      doubled: false,
      payout: 0,
    });
    await updateBlackjackRound(round.id, {
      deck: deck as unknown as { rank: string; suit: string }[],
      action_deadline_at: new Date(Date.now() + ACTION_WINDOW_MS).toISOString(),
    });

    // If first hand auto-stands (aces / blackjack), move to the next playing hand.
    if (statusA !== "playing") {
      const fresh = (await getActiveBlackjackRound())!;
      await advanceTurn(fresh);
    }

  } else {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, balance: await getBalance(s.user.id) });
}
