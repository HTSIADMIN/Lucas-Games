import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { playOneShot, validateBet } from "@/lib/games/common";
import { generateTicket } from "@/lib/games/scratch/engine";

export const runtime = "nodejs";

// Buy + reveal a scratch-off ticket. Outcome is decided server-side
// (pre-determined per the ticket spec) and returned in full so the
// client can animate the reveal.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const r = await playOneShot({
      userId: s.user.id,
      game: "scratch",
      bet: v.bet,
      state: {},
      runEngine: () => generateTicket(v.bet),
    });
    return NextResponse.json({
      ok: true,
      tier: r.outcome.tier,
      grid: r.outcome.grid,
      multiplier: r.outcome.multiplier,
      winLine: r.outcome.winLine,
      nearMissLine: r.outcome.nearMissLine,
      payout: r.outcome.payout,
      balance: r.balance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }
}
