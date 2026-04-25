import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { playOneShot, validateBet } from "@/lib/games/common";
import { spin } from "@/lib/games/slots/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const r = playOneShot({
      userId: s.user.id,
      game: "slots",
      bet: v.bet,
      state: {},
      runEngine: () => spin(v.bet),
    });
    return NextResponse.json({
      ok: true,
      reels: r.outcome.reels,
      kind: r.outcome.kind,
      symbol: r.outcome.symbol,
      multiplier: r.outcome.multiplier,
      payout: r.outcome.payout,
      balance: r.balance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }
}
