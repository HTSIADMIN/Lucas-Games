import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertPlinkoDrop } from "@/lib/db";
import { drop, type PlinkoRisk, type PlinkoRows } from "@/lib/games/plinko/engine";

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
    debit({
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

  insertPlinkoDrop({
    id,
    user_id: s.user.id,
    bet: v.bet,
    rows,
    risk,
    bucket: r.bucket,
    multiplier: r.multiplier,
    payout: r.payout,
    seed,
  });

  if (r.payout > 0) {
    credit({
      userId: s.user.id,
      amount: r.payout,
      reason: "plinko_win",
      refKind: "plinko",
      refId: `${id}:win`,
    });
  }

  return NextResponse.json({
    ok: true,
    dropId: id,
    bucket: r.bucket,
    multiplier: r.multiplier,
    payout: r.payout,
    table: r.table,
    rows,
    risk,
    balance: getBalance(s.user.id),
  });
}
