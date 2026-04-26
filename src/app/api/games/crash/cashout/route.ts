import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getCrashBet, insertGameSession, updateCrashBet } from "@/lib/db";
import { multiplierAt } from "@/lib/games/crash/engine";
import { getCrashState } from "@/lib/games/crash/scheduler";

export const runtime = "nodejs";

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // First, advance any stale state.
  await getCrashState();

  // Find the user's open bet on the active round.
  const round = await import("@/lib/db").then((m) => m.getActiveCrashRound());
  if (!round) return NextResponse.json({ error: "no_active_round" }, { status: 400 });
  if (round.status !== "running") {
    return NextResponse.json({ error: "not_running" }, { status: 400 });
  }
  const bet = await getCrashBet(round.id, s.user.id);
  if (!bet) return NextResponse.json({ error: "no_bet" }, { status: 400 });
  if (bet.cashout_at_x !== null) {
    return NextResponse.json({ error: "already_cashed" }, { status: 400 });
  }
  if (!round.started_at) return NextResponse.json({ error: "not_started" }, { status: 400 });

  const elapsedSec = (Date.now() - new Date(round.started_at).getTime()) / 1000;
  const liveX = multiplierAt(elapsedSec);
  const crashAtX = Number(round.crash_at_x);

  if (liveX >= crashAtX) {
    // Server clock says round is done — record bust; the scheduler will mark round crashed momentarily.
    await updateCrashBet(bet.id, { cashout_at_x: 0, payout: 0 });
    // Record for the bets feed.
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user.id,
      game: "crash",
      bet: bet.bet,
      payout: 0,
      state: { round_id: round.id, busted: true, crash_at_x: crashAtX },
      status: "settled",
    });
    return NextResponse.json({
      ok: true,
      busted: true,
      cashoutX: 0,
      crashAtX,
      payout: 0,
      balance: await getBalance(s.user.id),
    });
  }

  // Clamp to 2 decimal places to match what the client sees.
  const cashoutX = Math.floor(liveX * 100) / 100;
  const payout = Math.floor(bet.bet * cashoutX);

  await credit({
    userId: s.user.id,
    amount: payout,
    reason: "crash_cashout",
    refKind: "crash",
    refId: `${round.id}:${s.user.id}:cashout`,
  });
  await updateCrashBet(bet.id, {
    cashout_at_x: cashoutX,
    payout,
    cashed_out_at: new Date().toISOString(),
  });
  // Record for the bets feed.
  await insertGameSession({
    id: randomUUID(),
    user_id: s.user.id,
    game: "crash",
    bet: bet.bet,
    payout,
    state: { round_id: round.id, cashout_at_x: cashoutX },
    status: "settled",
  });

  return NextResponse.json({
    ok: true,
    busted: false,
    cashoutX,
    payout,
    balance: await getBalance(s.user.id),
  });
}
