import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { validateBet } from "@/lib/games/common";
import { debit, getBalance } from "@/lib/wallet";
import { insertCoinflipDuel } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { wager?: unknown; side?: "heads" | "tails" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const v = validateBet(body.wager);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (body.side !== "heads" && body.side !== "tails") {
    return NextResponse.json({ error: "side_invalid" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await debit({
      userId: s.user.id,
      amount: v.bet,
      reason: "coinflip_duel_escrow",
      refKind: "coinflip_duel",
      refId: `${id}:escrow`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  const duel = await insertCoinflipDuel({
    id,
    challenger_id: s.user.id,
    challenger_side: body.side,
    wager: v.bet,
    acceptor_id: null,
    result: null,
    winner_id: null,
    status: "open",
    created_at: new Date().toISOString(),
    resolved_at: null,
  });

  return NextResponse.json({ ok: true, duel, balance: await getBalance(s.user.id) });
}
