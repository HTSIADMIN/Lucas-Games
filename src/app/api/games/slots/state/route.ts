import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getActiveSlotRun, getSlotsMeter } from "@/lib/db";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

// Returns the player's current persistent meter value and any active
// hold-and-spin bonus run. Called on page mount and after wallet changes.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [meter, run, balance] = await Promise.all([
    getSlotsMeter(s.user.id),
    getActiveSlotRun(s.user.id),
    getBalance(s.user.id),
  ]);

  return NextResponse.json({
    ok: true,
    meter,
    balance,
    run: run
      ? {
          id: run.id,
          bet: run.bet,
          board: run.grid,
          respinsLeft: run.respins_left,
          coinsLocked: run.coins_locked,
          tier: run.building_tier,
        }
      : null,
  });
}
