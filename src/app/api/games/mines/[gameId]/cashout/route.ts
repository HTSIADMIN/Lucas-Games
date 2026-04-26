import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getMinesGame, insertGameSession, updateMinesGame } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { gameId } = await ctx.params;
  const game = await getMinesGame(gameId);
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (game.user_id !== s.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (game.status !== "active") return NextResponse.json({ error: "not_active" }, { status: 400 });

  // Refuse zero-reveal cashout (no profit; UX-safer to just let user reveal first).
  if (!game.revealed.includes("r")) {
    return NextResponse.json({ error: "no_reveals" }, { status: 400 });
  }

  const payout = Math.floor(game.bet * game.current_multiplier);
  await credit({
    userId: s.user.id,
    amount: payout,
    reason: "mines_cashout",
    refKind: "mines",
    refId: `${gameId}:cashout`,
  });
  await updateMinesGame(gameId, {
    status: "cashed",
    payout,
    ended_at: new Date().toISOString(),
  });
  // Record for the bets feed.
  await insertGameSession({
    id: randomUUID(),
    user_id: s.user.id,
    game: "mines",
    bet: game.bet,
    payout,
    state: { mineCount: game.mine_count, multiplier: Number(game.current_multiplier) },
    status: "settled",
  });

  return NextResponse.json({
    ok: true,
    status: "cashed",
    payout,
    multiplier: game.current_multiplier,
    layout: game.layout,
    revealed: game.revealed,
    balance: await getBalance(s.user.id),
  });
}
