import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import {
  getActiveSlotRun,
  getSlotsMeter,
  insertGameSession,
  insertSlotRun,
  setSlotsMeter,
} from "@/lib/db";
import { validateBet } from "@/lib/games/common";
import {
  baseSpin,
  buildInitialBonusBoard,
  cellToWire,
  type ReelCell,
} from "@/lib/games/slots/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  // Reject if there's already an active bonus — the player must respin first.
  const existing = await getActiveSlotRun(s.user.id);
  if (existing) {
    return NextResponse.json({ error: "bonus_in_progress", runId: existing.id }, { status: 409 });
  }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const bet = v.bet;

  // Debit the bet immediately. If subsequent steps throw, the wallet history
  // is the source of truth — the bet was real money committed to the spin.
  const sessionId = randomUUID();
  try {
    await debit({
      userId: s.user.id,
      amount: bet,
      reason: "slots_bet",
      refKind: "slots",
      refId: `${sessionId}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Roll
  const meterIn = await getSlotsMeter(s.user.id);
  const result = baseSpin(bet, meterIn);

  // Credit line wins
  if (result.linePayout > 0) {
    await credit({
      userId: s.user.id,
      amount: result.linePayout,
      reason: "slots_win",
      refKind: "slots",
      refId: `${sessionId}:lines`,
    });
  }

  // Persist meter
  await setSlotsMeter(s.user.id, result.meterAfter);

  // Record the base spin
  await insertGameSession({
    id: sessionId,
    user_id: s.user.id,
    game: "slots",
    bet,
    payout: result.linePayout,
    state: {
      coinCount: result.triggerCoinCount,
      bonusTriggered: result.bonusTriggered,
      meterForced: result.meterForcedThisSpin,
    },
    status: "settled",
  });

  // If the bonus triggered, open a slot_run row with the locked grid.
  let runId: string | null = null;
  let bonusBoard: { value: number | null; locked: boolean }[] | null = null;
  if (result.bonusTriggered) {
    const initial = buildInitialBonusBoard(result.grid);
    runId = randomUUID();
    await insertSlotRun({
      id: runId,
      user_id: s.user.id,
      bet,
      grid: initial.board,
      respins_left: 3,
      coins_locked: initial.coinsLocked,
      building_tier: result.bonusStartTier ?? 1,
      final_payout: null,
      status: "active",
    });
    bonusBoard = initial.board;
  }

  // Wire the result back to the client.
  const wireGrid = result.grid.map((col) => col.map((c: ReelCell) => cellToWire(c)));
  return NextResponse.json({
    ok: true,
    grid: wireGrid,
    lineWins: result.lineWins,
    linePayout: result.linePayout,
    coinCount: result.triggerCoinCount,
    bonusTriggered: result.bonusTriggered,
    runId,
    bonusBoard,
    bonusTier: result.bonusStartTier,
    meter: { value: result.meterAfter, gain: result.meterGain, forced: result.meterForcedThisSpin },
    balance: await getBalance(s.user.id),
  });
}
