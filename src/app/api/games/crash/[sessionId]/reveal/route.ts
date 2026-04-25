// Auto-settle a stale (already-crashed) round as bust.
// Called by the client when its animation hits the crash point with no cashout.
import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getGameSession, settleGameSession } from "@/lib/db";
import { multiplierAt } from "@/lib/games/crash/engine";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionId } = await ctx.params;
  const session = getGameSession(sessionId);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.user_id !== s.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (session.game !== "crash") return NextResponse.json({ error: "wrong_game" }, { status: 400 });

  const state = session.state as { crash_at_x: number; started_at: number };

  if (session.status === "open") {
    const elapsedSec = (Date.now() - state.started_at) / 1000;
    const liveX = multiplierAt(elapsedSec);
    if (liveX >= state.crash_at_x) {
      settleGameSession(sessionId, 0, { ...state, busted: true });
    }
  }

  return NextResponse.json({
    ok: true,
    crashAtX: state.crash_at_x,
    balance: getBalance(s.user.id),
  });
}
