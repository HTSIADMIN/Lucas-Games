import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { isTerminal, payoutFor, publicView, startHand, type BlackjackState } from "@/lib/games/blackjack/engine";

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
      payout = payoutFor(state);
      if (payout > 0) {
        await credit({
          userId: s.user.id,
          amount: payout,
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
