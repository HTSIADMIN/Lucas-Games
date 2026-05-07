import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { listArcadeUpgrades } from "@/lib/db";
import {
  ARCADE_GAMES,
  ARCADE_MAX_LEVEL,
  ARCADE_UPGRADE_COSTS,
  arcadeMultiplier,
  type ArcadeGame,
} from "@/lib/games/arcade/upgrades";

export const runtime = "nodejs";

// GET /api/earn/arcade/state
//
// Returns the player's current upgrade level for each arcade game
// (crossy_road / flappy / snake) plus the cost + multiplier of the
// next available level. The arcade game pages poll this once on
// mount + after each successful upgrade purchase.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await listArcadeUpgrades(s.user.id);
  const byGame = new Map(rows.map((r) => [r.game, r.level]));
  const games = ARCADE_GAMES.map((g: ArcadeGame) => {
    const level = byGame.get(g) ?? 0;
    const atMax = level >= ARCADE_MAX_LEVEL;
    return {
      game: g,
      level,
      maxLevel: ARCADE_MAX_LEVEL,
      currentMultiplier: arcadeMultiplier(level),
      nextMultiplier: atMax ? null : arcadeMultiplier(level + 1),
      nextCost: atMax ? null : ARCADE_UPGRADE_COSTS[level],
    };
  });
  return NextResponse.json({ ok: true, games });
}
