import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import {
  getActiveSlotRun,
  getSlotsMeter,
  insertGameSession,
  insertSlotRun,
  recentSlotsBetAvg,
  setSlotsMeter,
} from "@/lib/db";
import { validateBet } from "@/lib/games/common";
import {
  METER,
  baseSpin,
  buildInitialBonusBoard,
  cellToWire,
  type ReelCell,
} from "@/lib/games/slots/engine";
import { getJackpotPool, rollJackpotTrigger, STARTING_POOL } from "@/lib/games/slots/jackpot";

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
  let bet = v.bet;

  // Bet cap on the guaranteed-trigger spin only. The Whiskey Barrel
  // meter forces a Boomtown trigger once it crosses METER.full, so
  // a player could spam tiny bets to fill it cheaply then jump to a
  // max bet on the trigger spin to cash in. We only need to clamp
  // the final stretch of the meter — say the last ~5 spins worth
  // (METER_GAIN_MAX = 3, so 10 buffer covers any random advance) —
  // and below that the bet is whatever the player picks.
  //
  // Previously this clamped on every spin where meterIn0 > 0, which
  // silently capped a 100,000 ¢ bet down to whatever average the
  // player's last 10 spins had — i.e. it locked low rollers out of
  // bigger bets entirely once they'd taken even one cheap spin.
  const meterIn0 = await getSlotsMeter(s.user.id);
  const CLAMP_FROM = METER.full - 10; // last ~3-5 spins of fill
  if (meterIn0 >= CLAMP_FROM) {
    const avg = await recentSlotsBetAvg(s.user.id, 10);
    if (avg !== null && bet > avg) {
      // Clamp silently rather than reject — the player's UI shows
      // their requested bet, but they're charged + paid out at the
      // capped amount. Surfaced via the spin response.
      bet = avg;
    }
  }

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

  // The bet just landed in the wallet ledger; that debit is what
  // grows the progressive pool. Roll the 1-in-5000 trigger; if it
  // hits, read the live pool (which already reflects this spin's
  // bet), credit the player, and the credit itself drains the pool
  // back to STARTING_POOL. Pool + trigger are independent of the
  // base reel result, so a hit doesn't replace the normal line wins.
  const jackpotHit = rollJackpotTrigger();
  let jackpotPayout = 0;
  if (jackpotHit) {
    const poolNow = await getJackpotPool();
    jackpotPayout = poolNow - STARTING_POOL;
    if (jackpotPayout > 0) {
      await credit({
        userId: s.user.id,
        amount: jackpotPayout,
        reason: "slots_jackpot",
        refKind: "slots",
        refId: `${sessionId}:jackpot`,
      });
    }
  }

  // Roll. We already read the meter above for the bet-cap check; reuse it.
  const meterIn = meterIn0;
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
    /** Progressive jackpot pool snapshot AFTER this spin's bet
     *  accrual + any payout this spin. */
    jackpot: {
      pool: await getJackpotPool(),
      hit: jackpotHit,
      payout: jackpotPayout,
    },
    /** True if the route clamped the bet down because the player's
     *  requested stake exceeded their recent rolling average while
     *  the meter was filling. effectiveBet is what was actually
     *  charged. */
    betClamped: bet !== v.bet,
    requestedBet: v.bet,
    effectiveBet: bet,
  });
}
