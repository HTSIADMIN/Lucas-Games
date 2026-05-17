import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, insertPlinkoDrop } from "@/lib/db";
import { drop, type PlinkoRisk, type PlinkoRows } from "@/lib/games/plinko/engine";
import { mulBigByNumber, toBig, toNum } from "@/lib/big-math";
import { detectPlinkoAchievements } from "@/lib/achievements/detect";
import { unlockAndDetectAchievements } from "@/lib/achievements/settle";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown; rows?: unknown; risk?: PlinkoRisk };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const rowsNum = Number(body.rows);
  if (rowsNum !== 8 && rowsNum !== 12 && rowsNum !== 16) {
    return NextResponse.json({ error: "rows_invalid" }, { status: 400 });
  }
  const rows = rowsNum as PlinkoRows;
  const risk = body.risk;
  if (risk !== "low" && risk !== "med" && risk !== "high") {
    return NextResponse.json({ error: "risk_invalid" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await debit({
      userId: s.user.id,
      amount: v.bet,
      reason: "plinko_bet",
      refKind: "plinko",
      refId: `${id}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  const r = drop(rows, risk, v.bet);
  const seed = randomBytes(8).toString("hex");

  // BigInt-precise payout from the engine's multiplier so the wallet
  // credit doesn't drift past 9 quadrillion. `r.payout` (JS-number)
  // is fine for the DB columns and JSON response.
  const payoutBig = mulBigByNumber(toBig(v.bet), r.multiplier);
  const payout = toNum(payoutBig);

  await insertPlinkoDrop({
    id,
    user_id: s.user.id,
    bet: v.bet,
    rows,
    risk,
    bucket: r.bucket,
    multiplier: r.multiplier,
    payout,
    seed,
  });

  if (payoutBig > BigInt(0)) {
    await credit({
      userId: s.user.id,
      amount: payoutBig,
      reason: "plinko_win",
      refKind: "plinko",
      refId: `${id}:win`,
    });
  }

  // Record for the bets feed.
  await insertGameSession({
    id,
    user_id: s.user.id,
    game: "plinko",
    bet: v.bet,
    payout,
    state: { rows, risk, bucket: r.bucket, multiplier: r.multiplier },
    status: "settled",
  });

  const balanceAfter = await getBalance(s.user.id);
  const ids = detectPlinkoAchievements({
    bet: v.bet,
    payout,
    bucket: r.bucket,
    rows,
    risk,
  });
  const newlyUnlocked = await unlockAndDetectAchievements({
    userId: s.user.id,
    source: "plinko",
    perGameIds: ids,
    countAsBet: true,
    postBetBalance: balanceAfter,
  });
  return NextResponse.json({
    ok: true,
    dropId: id,
    bucket: r.bucket,
    multiplier: r.multiplier,
    payout,
    table: r.table,
    rows,
    risk,
    balance: balanceAfter,
    newlyUnlockedAchievements: newlyUnlocked,
  });
}
