import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getGameSession, settleGameSession } from "@/lib/db";
import { multiplierAt } from "@/lib/games/crash/engine";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId } = await ctx.params;
  const session = await getGameSession(sessionId);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.user_id !== s.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (session.game !== "crash") return NextResponse.json({ error: "wrong_game" }, { status: 400 });
  if (session.status !== "open") return NextResponse.json({ error: "already_settled" }, { status: 400 });

  const state = session.state as { crash_at_x: number; started_at: number };
  const elapsedSec = (Date.now() - state.started_at) / 1000;
  const liveX = multiplierAt(elapsedSec);

  // If we've already passed the crash point on the server clock, the ride is over — no payout.
  if (liveX >= state.crash_at_x) {
    await settleGameSession(sessionId, 0, {
      ...state,
      busted: true,
      bust_at_x: state.crash_at_x,
      cashout_attempted_at_x: Math.floor(liveX * 100) / 100,
    });
    return NextResponse.json({
      ok: true,
      busted: true,
      crashAtX: state.crash_at_x,
      payout: 0,
      balance: await getBalance(s.user.id),
    });
  }

  // Settle at server-side multiplier.
  const cashoutX = Math.floor(liveX * 100) / 100;
  const payout = Math.floor(session.bet * cashoutX);
  await credit({
    userId: s.user.id,
    amount: payout,
    reason: "crash_cashout",
    refKind: "crash",
    refId: `${sessionId}:cashout`,
  });
  await settleGameSession(sessionId, payout, { ...state, cashout_at_x: cashoutX });

  return NextResponse.json({
    ok: true,
    busted: false,
    cashoutX,
    crashAtX: state.crash_at_x,
    payout,
    balance: await getBalance(s.user.id),
  });
}
