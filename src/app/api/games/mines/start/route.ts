import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { debit, getBalance } from "@/lib/wallet";
import { insertMinesGame } from "@/lib/db";
import { GRID, makeLayout, multiplierFor } from "@/lib/games/mines/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown; mineCount?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const mineCount = Number(body.mineCount);
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) {
    return NextResponse.json({ error: "mine_count_invalid" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    debit({
      userId: s.user.id,
      amount: v.bet,
      reason: "mines_bet",
      refKind: "mines",
      refId: `${id}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  const layout = makeLayout(mineCount);
  insertMinesGame({
    id,
    user_id: s.user.id,
    bet: v.bet,
    mine_count: mineCount,
    layout,
    revealed: "-".repeat(GRID),
    status: "active",
    current_multiplier: 1.0,
    payout: 0,
  });

  return NextResponse.json({
    ok: true,
    gameId: id,
    revealed: "-".repeat(GRID),
    mineCount,
    safeRevealed: 0,
    multiplier: 1,
    nextMultiplier: multiplierFor(mineCount, 1),
    status: "active",
    bet: v.bet,
    payout: 0,
    balance: getBalance(s.user.id),
  });
}
