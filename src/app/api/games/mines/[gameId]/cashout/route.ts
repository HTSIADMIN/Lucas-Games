import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getMinesGame, insertGameSession, updateMinesGame } from "@/lib/db";
import { mulBigByNumber, toBig, toNum } from "@/lib/big-math";
import { detectMinesAchievements } from "@/lib/achievements/detect";
import { unlockAndDetectAchievements } from "@/lib/achievements/settle";

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

  const payoutBig = mulBigByNumber(toBig(game.bet), Number(game.current_multiplier));
  const payout = toNum(payoutBig);
  await credit({
    userId: s.user.id,
    amount: payoutBig,
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

  // Count revealed gems (r = revealed, . = unrevealed) on the mask.
  const revealedGems = (game.revealed.match(/r/g) || []).length;
  const totalGems = 25 - game.mine_count;
  const ids = detectMinesAchievements({
    revealed: revealedGems,
    totalGems,
    busted: false,
    cashedOut: true,
  });
  const balanceAfter = await getBalance(s.user.id);
  // Mines counts as a bet at START (debit landed there), not on cashout.
  // The cashout is the win-side event — skip the meta bet-counter bump.
  const newlyUnlocked = await unlockAndDetectAchievements({
    userId: s.user.id,
    source: "mines",
    perGameIds: ids,
    countAsBet: false,
    postBetBalance: balanceAfter,
  });
  return NextResponse.json({
    ok: true,
    status: "cashed",
    payout,
    multiplier: game.current_multiplier,
    layout: game.layout,
    revealed: game.revealed,
    balance: balanceAfter,
    newlyUnlockedAchievements: newlyUnlocked,
  });
}
