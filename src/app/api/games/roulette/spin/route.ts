import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { spin, validateBet, type RouletteBet } from "@/lib/games/roulette/engine";

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
  if (total > 100_000_000) return NextResponse.json({ error: "bet_too_high" }, { status: 400 });

  const sessionId = randomUUID();
  try {
    debit({
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

  insertGameSession({
    id: sessionId,
    user_id: s.user.id,
    game: "roulette",
    bet: total,
    payout: 0,
    state: { bets, winning: result.winning },
    status: "open",
  });

  if (result.totalPayout > 0) {
    credit({
      userId: s.user.id,
      amount: result.totalPayout,
      reason: "roulette_settle",
      refKind: "roulette",
      refId: `${sessionId}:settle`,
    });
  }
  settleGameSession(sessionId, result.totalPayout, { bets, ...result });

  return NextResponse.json({
    ok: true,
    sessionId,
    winning: result.winning,
    color: result.color,
    rows: result.rows,
    totalBet: result.totalBet,
    totalPayout: result.totalPayout,
    balance: getBalance(s.user.id),
  });
}
