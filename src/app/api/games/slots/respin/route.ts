import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import {
  getActiveSlotRun,
  insertGameSession,
  updateSlotRun,
} from "@/lib/db";
import {
  bonusRespin,
  settleBonus,
  type BonusCell,
} from "@/lib/games/slots/engine";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

// Run one respin on the user's active hold-and-spin bonus. Returns the
// updated board, what's new, and (when finished) the final payout.
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const run = await getActiveSlotRun(s.user.id);
  if (!run) return NextResponse.json({ error: "no_active_bonus" }, { status: 404 });

  const board = (run.grid as unknown as BonusCell[]) ?? [];

  const result = bonusRespin({
    board,
    respinsLeft: run.respins_left,
    coinsLocked: run.coins_locked,
    buildingTier: run.building_tier,
  });

  if (!result.finished) {
    await updateSlotRun(run.id, {
      grid: result.board,
      respins_left: result.respinsLeft,
      coins_locked: result.coinsLocked,
      building_tier: result.tier,
    });
    return NextResponse.json({
      ok: true,
      finished: false,
      board: result.board,
      newCoins: result.newCoins,
      newBuildings: result.newBuildings,
      respinsLeft: result.respinsLeft,
      coinsLocked: result.coinsLocked,
      tier: result.tier,
      filledScreen: false,
      payout: 0,
      balance: await getBalance(s.user.id),
    });
  }

  // Bonus ended — settle.
  const settled = settleBonus({
    bet: run.bet,
    board: result.board,
    buildingTier: result.tier,
    filledScreen: result.filledScreen,
  });

  await updateSlotRun(run.id, {
    grid: result.board,
    respins_left: 0,
    coins_locked: result.coinsLocked,
    building_tier: settled.tier,
    final_payout: settled.payout,
    status: "settled",
    ended_at: new Date().toISOString(),
  });

  if (settled.payout > 0) {
    await credit({
      userId: s.user.id,
      amount: settled.payout,
      reason: "slots_bonus_win",
      refKind: "slots",
      refId: `${run.id}:bonus`,
    });
  }

  // Record the bonus payout so it shows up in big-bets feeds + history.
  await insertGameSession({
    id: randomUUID(),
    user_id: s.user.id,
    game: "slots",
    bet: 0,
    payout: settled.payout,
    state: {
      kind: "bonus_settle",
      tier: settled.tier,
      coinTotal: settled.coinTotal,
      filledScreen: result.filledScreen,
      runId: run.id,
    },
    status: "settled",
  });

  return NextResponse.json({
    ok: true,
    finished: true,
    board: result.board,
    newCoins: result.newCoins,
    newBuildings: result.newBuildings,
    respinsLeft: 0,
    coinsLocked: result.coinsLocked,
    tier: settled.tier,
    filledScreen: result.filledScreen,
    payout: settled.payout,
    coinTotal: settled.coinTotal,
    balance: await getBalance(s.user.id),
  });
}
