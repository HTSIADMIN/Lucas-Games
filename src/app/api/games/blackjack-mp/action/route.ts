import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { debit, getBalance } from "@/lib/wallet";
import {
  getActiveBlackjackRound,
  getBlackjackSeat,
  updateBlackjackRound,
  updateBlackjackSeat,
} from "@/lib/db";
import { advanceTurn, handTotal, getBlackjackState } from "@/lib/games/blackjack-mp/scheduler";
import type { Card } from "@/lib/games/cards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: "hit" | "stand" | "double" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  // Advance any stale state.
  await getBlackjackState();

  const round = await getActiveBlackjackRound();
  if (!round) return NextResponse.json({ error: "no_round" }, { status: 400 });
  if (round.status !== "player_turn") return NextResponse.json({ error: "not_player_turn" }, { status: 400 });
  if (round.current_user_id !== s.user.id) return NextResponse.json({ error: "not_your_turn" }, { status: 400 });

  const seat = await getBlackjackSeat(round.id, s.user.id);
  if (!seat || seat.status !== "playing") return NextResponse.json({ error: "no_active_seat" }, { status: 400 });

  const deck = round.deck as Card[];
  const hand = (seat.hand as Card[]).slice();

  if (body.action === "hit") {
    const c = deck.pop();
    if (c) hand.push(c);
    const total = handTotal(hand);
    if (total > 21) {
      await updateBlackjackSeat(seat.id, { hand, status: "busted" });
      await updateBlackjackRound(round.id, { deck: deck as unknown as { rank: string; suit: string }[] });
      // Advance to next seat.
      const fresh = (await getActiveBlackjackRound())!;
      await advanceTurn(fresh);
    } else {
      await updateBlackjackSeat(seat.id, { hand });
      await updateBlackjackRound(round.id, {
        deck: deck as unknown as { rank: string; suit: string }[],
        action_deadline_at: new Date(Date.now() + 15_000).toISOString(),
      });
    }
  } else if (body.action === "stand") {
    await updateBlackjackSeat(seat.id, { status: "standing" });
    const fresh = (await getActiveBlackjackRound())!;
    await advanceTurn(fresh);
  } else if (body.action === "double") {
    if (seat.hand.length !== 2) return NextResponse.json({ error: "cant_double" }, { status: 400 });
    try {
      await debit({
        userId: s.user.id,
        amount: seat.bet,
        reason: "blackjack_double",
        refKind: "blackjack",
        refId: `${round.id}:${s.user.id}:double`,
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
  } else {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, balance: await getBalance(s.user.id) });
}
