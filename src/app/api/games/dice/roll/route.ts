import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { playOneShot, validateBet } from "@/lib/games/common";
import { roll, type DiceDirection } from "@/lib/games/dice/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown; target?: unknown; direction?: DiceDirection };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const target = Number(body.target);
  const dir = body.direction;
  if (!Number.isInteger(target) || target < 2 || target > 99) {
    return NextResponse.json({ error: "target_invalid" }, { status: 400 });
  }
  if (dir !== "over" && dir !== "under") {
    return NextResponse.json({ error: "direction_invalid" }, { status: 400 });
  }

  try {
    const r = await playOneShot({
      userId: s.user.id,
      game: "dice",
      bet: v.bet,
      state: { target, direction: dir },
      runEngine: () => roll(target, dir, v.bet),
    });
    return NextResponse.json({
      ok: true,
      roll: r.outcome.roll,
      win: r.outcome.win,
      multiplier: r.outcome.multiplier,
      payout: r.outcome.payout,
      balance: r.balance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }
}
