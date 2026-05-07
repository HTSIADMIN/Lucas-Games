import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { debit, getBalance } from "@/lib/wallet";
import { getArcadeUpgrade, setArcadeUpgrade } from "@/lib/db";
import {
  ARCADE_GAMES,
  ARCADE_MAX_LEVEL,
  ARCADE_UPGRADE_COSTS,
  type ArcadeGame,
} from "@/lib/games/arcade/upgrades";

export const runtime = "nodejs";

// POST /api/earn/arcade/upgrade   body: { game }
//
// Spends wallet ¢ to advance the player's earn-rate level for one
// of the three arcade games. Cost comes from
// ARCADE_UPGRADE_COSTS[currentLevel]. Server is authoritative —
// reads the live level, checks balance, debits, and writes the
// new level back. Each successful purchase advances by exactly
// one level; capped at ARCADE_MAX_LEVEL.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { game?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const game = String(body.game ?? "");
  if (!ARCADE_GAMES.includes(game as ArcadeGame)) {
    return NextResponse.json({ error: "bad_game" }, { status: 400 });
  }

  const existing = await getArcadeUpgrade(s.user.id, game);
  const currentLevel = existing?.level ?? 0;
  if (currentLevel >= ARCADE_MAX_LEVEL) {
    return NextResponse.json({ error: "already_maxed" }, { status: 400 });
  }
  const cost = ARCADE_UPGRADE_COSTS[currentLevel];

  try {
    await debit({
      userId: s.user.id,
      amount: cost,
      reason: "arcade_upgrade",
      refKind: "arcade_upgrade",
      refId: `${game}:${currentLevel + 1}:${randomUUID()}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const newLevel = currentLevel + 1;
  await setArcadeUpgrade(s.user.id, game, newLevel);

  return NextResponse.json({
    ok: true,
    game,
    level: newLevel,
    cost,
    balance: await getBalance(s.user.id),
  });
}
