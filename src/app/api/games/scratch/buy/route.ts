import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { playOneShot } from "@/lib/games/common";
import { generateTicket } from "@/lib/games/scratch/engine";
import { isValidScratchCost, designForCost } from "@/lib/games/scratch/designs";

export const runtime = "nodejs";

// Buy + reveal a scratch-off ticket. Outcome is decided server-side
// and returned in full so the client can drive the reveal animation.
//
// The ticket cost is one of three fixed tiers (10k / 100k / 1M); the
// design is implied by the cost. Optional `daily=true` flag uses a
// separate path with elevated odds — that is gated by /api/games/scratch/daily.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { cost?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!isValidScratchCost(body.cost)) {
    return NextResponse.json({ error: "invalid_ticket_cost" }, { status: 400 });
  }
  const cost = body.cost;
  const design = designForCost(cost).id;

  try {
    const r = await playOneShot({
      userId: s.user.id,
      game: "scratch",
      bet: cost,
      state: { design },
      runEngine: () => generateTicket({ cost, design }),
    });
    return NextResponse.json({
      ok: true,
      ticket: r.outcome,
      balance: r.balance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }
}
