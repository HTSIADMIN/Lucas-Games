import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { quickDrawMultiplier, QUICK_DRAW_BASE } from "@/lib/games/scratch/engine";

export const runtime = "nodejs";

// Sheriff-star bonus round. The client times the player's reaction
// to a "DRAW!" signal and posts the elapsed ms here. We re-run the
// curve server-side and credit the resulting payout.
//
// V2 trusts the client clock — anti-cheat is just a sanity floor at
// 120ms (handled inside quickDrawMultiplier). A future revision could
// require the server to issue a signed nonce + start-time on a paired
// /quickdraw/start endpoint to make replays infeasible.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { reactionMs?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const reactionMs = Number(body.reactionMs);
  if (!Number.isFinite(reactionMs) || reactionMs < 0 || reactionMs > 5_000) {
    return NextResponse.json({ error: "bad_reaction" }, { status: 400 });
  }

  const multiplier = quickDrawMultiplier(reactionMs);
  const payout = multiplier * QUICK_DRAW_BASE;
  const sessionId = randomUUID();

  await insertGameSession({
    id: sessionId,
    user_id: s.user.id,
    game: "scratch",
    bet: 0,
    payout: 0,
    state: { kind: "quick_draw", reactionMs },
    status: "open",
  });

  if (payout > 0) {
    await credit({
      userId: s.user.id,
      amount: payout,
      reason: "scratch_quickdraw_win",
      refKind: "scratch",
      refId: `${sessionId}:qd`,
    });
  }

  await settleGameSession(sessionId, payout, { kind: "quick_draw", reactionMs, multiplier });

  return NextResponse.json({
    ok: true,
    multiplier,
    payout,
    reactionMs,
    balance: await getBalance(s.user.id),
  });
}
