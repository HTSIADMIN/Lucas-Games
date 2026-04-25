import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { playOneShot, validateBet } from "@/lib/games/common";
import { flip, type CoinSide } from "@/lib/games/coinflip/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { bet?: unknown; pick?: CoinSide };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const v = validateBet(body.bet);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (body.pick !== "heads" && body.pick !== "tails") {
    return NextResponse.json({ error: "pick_invalid" }, { status: 400 });
  }
  const pick = body.pick;
  const bet = v.bet;

  try {
    const r = await playOneShot({
      userId: s.user.id,
      game: "coinflip",
      bet,
      state: { pick },
      runEngine: () => flip(pick, bet),
    });
    return NextResponse.json({
      ok: true,
      result: r.outcome.result,
      win: r.outcome.win,
      payout: r.outcome.payout,
      balance: r.balance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "insufficient_funds") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
