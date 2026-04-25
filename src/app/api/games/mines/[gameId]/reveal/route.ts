import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getMinesGame, updateMinesGame } from "@/lib/db";
import { GRID, countSafe, multiplierFor } from "@/lib/games/mines/engine";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { gameId } = await ctx.params;
  let body: { cell?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const cell = Number(body.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell >= GRID) {
    return NextResponse.json({ error: "cell_invalid" }, { status: 400 });
  }

  const game = await getMinesGame(gameId);
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (game.user_id !== s.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (game.status !== "active") return NextResponse.json({ error: "not_active" }, { status: 400 });
  if (game.revealed[cell] !== "-") return NextResponse.json({ error: "already_revealed" }, { status: 400 });

  const isMine = game.layout[cell] === "m";
  const newRevealed =
    game.revealed.slice(0, cell) + (isMine ? "x" : "r") + game.revealed.slice(cell + 1);

  if (isMine) {
    await updateMinesGame(gameId, {
      revealed: newRevealed,
      status: "busted",
      payout: 0,
      ended_at: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      cell,
      isMine: true,
      revealed: newRevealed,
      layout: game.layout, // reveal full layout on bust
      status: "busted",
      multiplier: 0,
      nextMultiplier: 0,
      bet: game.bet,
      payout: 0,
      balance: await getBalance(s.user.id),
    });
  }

  const safeCount = countSafe(newRevealed);
  const m = multiplierFor(game.mine_count, safeCount);
  updateMinesGame(gameId, {
    revealed: newRevealed,
    current_multiplier: m,
  });

  return NextResponse.json({
    ok: true,
    cell,
    isMine: false,
    revealed: newRevealed,
    status: "active",
    multiplier: m,
    nextMultiplier: multiplierFor(game.mine_count, safeCount + 1),
    bet: game.bet,
    payout: 0,
    balance: getBalance(s.user.id),
  });
}
