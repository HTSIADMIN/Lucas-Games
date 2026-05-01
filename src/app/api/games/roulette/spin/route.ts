import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { spin, validateBet, type RouletteBet } from "@/lib/games/roulette/engine";
import { getHotNumber, HOT_PAYOUT, STRAIGHT_PAYOUT } from "@/lib/games/roulette/hot";

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
  if (total > 100_000_000_000) return NextResponse.json({ error: "bet_too_high" }, { status: 400 });

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

  if (result.totalPayout > 0) {
    await credit({
      userId: s.user.id,
      amount: result.totalPayout,
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
  let hotBonus = 0;
  if (result.winning === hot.value) {
    for (const b of bets) {
      if (b.type === "straight" && b.value === hot.value) {
        hotBonus += b.amount * (HOT_PAYOUT - STRAIGHT_PAYOUT);
      }
    }
  }
  if (hotBonus > 0) {
    await credit({
      userId: s.user.id,
      amount: hotBonus,
      reason: "roulette_hot_bonus",
      refKind: "roulette",
      refId: `${sessionId}:hot`,
    });
  }

  await settleGameSession(sessionId, result.totalPayout + hotBonus, { bets, ...result, hot: hot.value, hotBonus });

  return NextResponse.json({
    ok: true,
    sessionId,
    winning: result.winning,
    color: result.color,
    rows: result.rows,
    totalBet: result.totalBet,
    totalPayout: result.totalPayout + hotBonus,
    hotNumber: hot.value,
    hotBonus,
    balance: await getBalance(s.user.id),
  });
}
