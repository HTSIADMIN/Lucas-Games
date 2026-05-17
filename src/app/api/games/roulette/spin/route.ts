import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { spin, validateBet, type RouletteBet } from "@/lib/games/roulette/engine";
import { getHotNumber, HOT_PAYOUT, STRAIGHT_PAYOUT } from "@/lib/games/roulette/hot";
import { mulBigByNumber, toBig, toNum } from "@/lib/big-math";
import { detectRouletteAchievements } from "@/lib/achievements/detect";
import { unlockAndDetectAchievements } from "@/lib/achievements/settle";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bets?: RouletteBet[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const bets = Array.isArray(body.bets) ? body.bets : [];
  if (bets.length === 0) return NextResponse.json({ error: "no_bets" }, { status: 400 });
  if (bets.length > 50) return NextResponse.json({ error: "too_many_bets" }, { status: 400 });

  for (const b of bets) {
    const e = validateBet(b);
    if (e) return NextResponse.json({ error: e }, { status: 400 });
  }
  const total = bets.reduce((sum, b) => sum + b.amount, 0);
  // No upper cap — the wallet balance is the only real ceiling.
  // debit() throws insufficient_funds if the total exceeds it.

  const sessionId = randomUUID();
  try {
    await debit({
      userId: s.user.id,
      amount: total,
      reason: "roulette_bet",
      refKind: "roulette",
      refId: `${sessionId}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  const result = spin(bets);

  await insertGameSession({
    id: sessionId,
    user_id: s.user.id,
    game: "roulette",
    bet: total,
    payout: 0,
    state: { bets, winning: result.winning },
    status: "open",
  });

  // BigInt-precise total payout: derive each winning row's float
  // multiplier from `row.payout / row.amount` (always an integer:
  // 2/3/36) and re-multiply against the BigInt stake. Sum with
  // BigInt `+` so quadrillion-scale stakes don't drift.
  let totalPayoutBig = BigInt(0);
  for (const row of result.rows) {
    if (!row.win || row.payout <= 0 || row.amount <= 0) continue;
    const m = row.payout / row.amount;
    totalPayoutBig = totalPayoutBig + mulBigByNumber(toBig(row.amount), m);
  }
  const totalPayoutNum = toNum(totalPayoutBig);

  if (totalPayoutBig > BigInt(0)) {
    await credit({
      userId: s.user.id,
      amount: totalPayoutBig,
      reason: "roulette_settle",
      refKind: "roulette",
      refId: `${sessionId}:settle`,
    });
  }

  // Hot-number bonus — if the winning number matches the currently
  // hot one and the player had a straight bet on it, top up the
  // payout from 35× (already credited above) to 50×. The bonus delta
  // is HOT_PAYOUT - STRAIGHT_PAYOUT = 15× the straight stake.
  const hot = getHotNumber();
  let hotBonusBig = BigInt(0);
  if (result.winning === hot.value) {
    for (const b of bets) {
      if (b.type === "straight" && b.value === hot.value) {
        hotBonusBig =
          hotBonusBig +
          mulBigByNumber(toBig(b.amount), HOT_PAYOUT - STRAIGHT_PAYOUT);
      }
    }
  }
  const hotBonus = toNum(hotBonusBig);
  if (hotBonusBig > BigInt(0)) {
    await credit({
      userId: s.user.id,
      amount: hotBonusBig,
      reason: "roulette_hot_bonus",
      refKind: "roulette",
      refId: `${sessionId}:hot`,
    });
  }

  const totalOut = toNum(totalPayoutBig + hotBonusBig);
  await settleGameSession(sessionId, totalOut, { bets, ...result, totalPayout: totalPayoutNum, hot: hot.value, hotBonus });

  // Achievement detection. `straightUpHit` = any straight bet whose
  // value matched the winning number AND the player wagered on it.
  // `previousWasWin` left false in v1 — would require a separate
  // query for the player's prior roulette settle; deferred.
  const straightUpHit = bets.some(
    (b) => b.type === "straight" && b.value === result.winning,
  );
  const balanceAfter = await getBalance(s.user.id);
  const ids = detectRouletteAchievements({
    won: totalOut > total,
    straightUpHit,
    betPositions: bets.length,
    previousWasWin: false,
  });
  const newlyUnlocked = await unlockAndDetectAchievements({
    userId: s.user.id,
    source: "roulette",
    perGameIds: ids,
    countAsBet: true,
    postBetBalance: balanceAfter,
  });
  return NextResponse.json({
    ok: true,
    sessionId,
    winning: result.winning,
    color: result.color,
    rows: result.rows,
    totalBet: result.totalBet,
    totalPayout: totalOut,
    hotNumber: hot.value,
    hotBonus,
    balance: balanceAfter,
    newlyUnlockedAchievements: newlyUnlocked,
  });
}
