import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { getGameSession, updateGameSession, settleGameSession } from "@/lib/db";
import {
  doubleAdditional,
  doubleDown,
  hit,
  isTerminal,
  payoutFor,
  publicView,
  stand,
  type BlackjackState,
} from "@/lib/games/blackjack/engine";

export const runtime = "nodejs";

type Action = "hit" | "stand" | "double";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId } = await ctx.params;

  let body: { action?: Action };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const action = body.action;
  if (action !== "hit" && action !== "stand" && action !== "double") {
    return NextResponse.json({ error: "action_invalid" }, { status: 400 });
  }

  const session = await getGameSession(sessionId);
  if (!session) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  if (session.user_id !== s.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (session.game !== "blackjack") return NextResponse.json({ error: "wrong_game" }, { status: 400 });
  if (session.status === "settled") return NextResponse.json({ error: "already_settled" }, { status: 400 });

  let state = session.state as unknown as BlackjackState;
  if (state.status !== "player_turn") return NextResponse.json({ error: "not_player_turn" }, { status: 400 });

  try {
    if (action === "double") {
      const additional = doubleAdditional(state);
      await debit({
        userId: s.user.id,
        amount: additional,
        reason: "blackjack_double",
        refKind: "blackjack",
        refId: `${sessionId}:double`,
      });
      state = doubleDown(state);
    } else if (action === "hit") {
      state = hit(state);
    } else {
      state = stand(state);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  let payout: number | null = null;
  let balance = await getBalance(s.user.id);
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
    await settleGameSession(sessionId, payout, state as unknown as Record<string, unknown>);
    balance = await getBalance(s.user.id);
  } else {
    await updateGameSession(sessionId, { state: state as unknown as Record<string, unknown> });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    ...publicView(state, true),
    payout,
    balance,
  });
}
