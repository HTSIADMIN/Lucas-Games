import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { debit, getBalance } from "@/lib/wallet";
import { getCrashBet, insertCrashBet } from "@/lib/db";
import { getCrashState } from "@/lib/games/crash/scheduler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const state = await getCrashState();
  if (!state.round) return NextResponse.json({ error: "no_active_round" }, { status: 400 });
  if (state.round.status !== "betting") {
    return NextResponse.json({ error: "betting_closed" }, { status: 400 });
  }

  // Already bet this round?
  const existing = await getCrashBet(state.round.id, s.user.id);
  if (existing) return NextResponse.json({ error: "already_bet_this_round" }, { status: 409 });

  try {
    await debit({
      userId: s.user.id,
      amount: v.bet,
      reason: "crash_bet",
      refKind: "crash",
      refId: `${state.round.id}:${s.user.id}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  try {
    await insertCrashBet({
      round_id: state.round.id,
      user_id: s.user.id,
      bet: v.bet,
      cashout_at_x: null,
      payout: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    roundId: state.round.id,
    balance: await getBalance(s.user.id),
  });
}
