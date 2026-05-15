import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { isTerminal, publicView, startHand, type BlackjackState } from "@/lib/games/blackjack/engine";
import { mulBigByNumber, toBig, toNum } from "@/lib/big-math";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const bet = v.bet;

  try {
    const sessionId = randomUUID();
    await debit({
      userId: s.user.id,
      amount: bet,
      reason: "blackjack_bet",
      refKind: "blackjack",
      refId: `${sessionId}:bet`,
    });

    const state = startHand(bet);
    await insertGameSession({
      id: sessionId,
      user_id: s.user.id,
      game: "blackjack",
      bet,
      payout: 0,
      state: serialize(state),
      status: "open",
    });

    let balance = await getBalance(s.user.id);
    let payout = 0;
    if (isTerminal(state.status)) {
      // BigInt-precise payout: derive the float win factor from the
      // terminal status so wallet credits stay exact past 9 quadrillion.
      // The deal hand can only terminate at player_blackjack, push (both
      // blackjack), or loss (dealer blackjack vs player non-blackjack).
      let winFactor = 0;
      switch (state.status) {
        case "player_blackjack":
          winFactor = 2.5;
          break;
        case "win":
        case "dealer_bust":
          winFactor = 2;
          break;
        case "push":
          winFactor = 1;
          break;
        default:
          winFactor = 0;
      }
      const stakeBig = state.doubled ? toBig(state.bet) * BigInt(2) : toBig(state.bet);
      const payoutBig =
        winFactor > 0 ? mulBigByNumber(stakeBig, winFactor) : BigInt(0);
      payout = toNum(payoutBig);
      if (payoutBig > BigInt(0)) {
        await credit({
          userId: s.user.id,
          amount: payoutBig,
          reason: "blackjack_settle",
          refKind: "blackjack",
          refId: `${sessionId}:settle`,
        });
      }
      await settleGameSession(sessionId, payout, serialize(state));
      balance = await getBalance(s.user.id);
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      ...publicView(state, true),
      payout: isTerminal(state.status) ? payout : null,
      balance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }
}

function serialize(state: BlackjackState): Record<string, unknown> {
  return state as unknown as Record<string, unknown>;
}
