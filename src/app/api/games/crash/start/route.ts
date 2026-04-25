import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { debit, getBalance } from "@/lib/wallet";
import { insertGameSession } from "@/lib/db";
import { pickCrashPoint } from "@/lib/games/crash/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const sessionId = randomUUID();
  try {
    await debit({
      userId: s.user.id,
      amount: v.bet,
      reason: "crash_bet",
      refKind: "crash",
      refId: `${sessionId}:bet`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  const crashAtX = pickCrashPoint();
  const startedAt = Date.now();

  await insertGameSession({
    id: sessionId,
    user_id: s.user.id,
    game: "crash",
    bet: v.bet,
    payout: 0,
    state: { crash_at_x: crashAtX, started_at: startedAt },
    status: "open",
  });

  // crash_at_x is intentionally not returned.
  return NextResponse.json({
    ok: true,
    sessionId,
    startedAt,
    bet: v.bet,
    balance: await getBalance(s.user.id),
  });
}
