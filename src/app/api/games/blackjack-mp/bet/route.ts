import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { debit, getBalance } from "@/lib/wallet";
import { getBlackjackSeat, insertBlackjackSeat } from "@/lib/db";
import { getBlackjackState } from "@/lib/games/blackjack-mp/scheduler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const state = await getBlackjackState();
  if (!state.round) return NextResponse.json({ error: "no_round" }, { status: 400 });
  if (state.round.status !== "betting") return NextResponse.json({ error: "betting_closed" }, { status: 400 });

  const existing = await getBlackjackSeat(state.round.id, s.user.id);
  if (existing) return NextResponse.json({ error: "already_seated" }, { status: 409 });

  try {
    await debit({
      userId: s.user.id,
      amount: v.bet,
      reason: "blackjack_bet",
      refKind: "blackjack",
      refId: `${state.round.id}:${s.user.id}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  await insertBlackjackSeat({
    round_id: state.round.id,
    user_id: s.user.id,
    bet: v.bet,
    hand: [],
    status: "waiting",
    doubled: false,
    payout: 0,
  });

  return NextResponse.json({ ok: true, balance: await getBalance(s.user.id) });
}
