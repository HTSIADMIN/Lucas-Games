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
import { mulBigByNumber, toBig, toNum } from "@/lib/big-math";

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

  // BigInt-precise bonus payout: the engine computes
  // `Math.floor(coinTotal * mult * (bet / 20))` in JS-number, which
  // drifts at quadrillion-scale stakes. Derive the effective bonus
  // multiplier from the engine's result and re-multiply against the
  // BigInt bet so the wallet credit stays exact.
  let bonusPayoutBig = BigInt(0);
  if (settled.payout > 0 && run.bet > 0) {
    const bonusMultiplier = settled.payout / run.bet;
    bonusPayoutBig = mulBigByNumber(toBig(run.bet), bonusMultiplier);
  } else if (settled.payout > 0) {
    // Defensive: if bet was 0 (shouldn't happen for a real bonus run),
    // fall back to the engine's number to keep behavior stable.
    bonusPayoutBig = toBig(settled.payout);
  }
  const bonusPayoutOut = toNum(bonusPayoutBig);

  await updateSlotRun(run.id, {
    grid: result.board,
    respins_left: 0,
    coins_locked: result.coinsLocked,
    building_tier: settled.tier,
    final_payout: bonusPayoutOut,
    status: "settled",
    ended_at: new Date().toISOString(),
  });

  if (bonusPayoutBig > BigInt(0)) {
    await credit({
      userId: s.user.id,
      amount: bonusPayoutBig,
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
    payout: bonusPayoutOut,
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
    payout: bonusPayoutOut,
    coinTotal: settled.coinTotal,
    balance: await getBalance(s.user.id),
  });
}
