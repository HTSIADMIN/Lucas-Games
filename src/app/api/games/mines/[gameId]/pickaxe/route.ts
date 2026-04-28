import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getMinesGame, updateMinesGame } from "@/lib/db";
import { countSafe, multiplierFor } from "@/lib/games/mines/engine";
import { consumePickaxe } from "@/lib/games/mines/pickaxe";

export const runtime = "nodejs";

// Use the Lucky Pickaxe — reveals one random unrevealed safe tile
// for free. Still climbs the multiplier ladder (the player gets the
// progression benefit too). Single-use per game; the in-memory
// pickaxe tracker enforces it.
export async function POST(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { gameId } = await ctx.params;
  const game = await getMinesGame(gameId);
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (game.user_id !== s.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (game.status !== "active") return NextResponse.json({ error: "not_active" }, { status: 400 });

  if (!consumePickaxe(gameId)) {
    return NextResponse.json({ error: "no_pickaxe" }, { status: 400 });
  }

  // Pick a random unrevealed safe tile. If none exist (highly
  // unlikely — would mean every safe tile is already revealed), bail
  // out gracefully without spending the pickaxe.
  const candidates: number[] = [];
  for (let i = 0; i < game.layout.length; i++) {
    if (game.revealed[i] === "-" && game.layout[i] !== "m") candidates.push(i);
  }
  if (candidates.length === 0) {
    return NextResponse.json({ error: "no_safe_tiles" }, { status: 400 });
  }

  const cell = candidates[randomInt(0, candidates.length)];
  const newRevealed = game.revealed.slice(0, cell) + "r" + game.revealed.slice(cell + 1);
  const safeCount = countSafe(newRevealed);
  const m = multiplierFor(game.mine_count, safeCount);
  await updateMinesGame(gameId, {
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
    balance: await getBalance(s.user.id),
  });
}
