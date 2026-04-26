import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getCrashState } from "@/lib/games/crash/scheduler";
import { listCrashBets } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getCrashState();
  let bets: {
    userId: string;
    amount: number;
    cashoutX: number | null;
    payout: number;
  }[] = [];
  if (state.round) {
    const rows = await listCrashBets(state.round.id);
    bets = rows.map((b) => ({
      userId: b.user_id,
      amount: b.bet,
      cashoutX: b.cashout_at_x !== null ? Number(b.cashout_at_x) : null,
      payout: b.payout,
    }));
  }

  return NextResponse.json({
    ...state,
    bets,
  });
}
