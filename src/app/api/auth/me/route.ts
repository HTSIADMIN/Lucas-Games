import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getUserLevel } from "@/lib/xpServer";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });

  // Activity-based XP — see src/lib/xp.ts for the rationale. The
  // old payload included `totalNetWon`; the new shape exposes the
  // activity counters (gamesPlayed, achievementsUnlocked, plus a
  // reserved playMinutes) so future consumers can see what's
  // feeding the level.
  const lvl = await getUserLevel(s.user.id);

  return NextResponse.json({
    user: { id: s.user.id, username: s.user.username },
    balance: await getBalance(s.user.id),
    xp: lvl.xp,
    level: lvl.level,
    currentLevelXp: lvl.currentLevelXp,
    nextLevelXp: lvl.nextLevelXp,
    intoLevelXp: lvl.intoLevelXp,
    toNextXp: lvl.toNextXp,
    gamesPlayed: lvl.gamesPlayed,
    playMinutes: lvl.playMinutes,
    achievementsUnlocked: lvl.achievementsUnlocked,
  });
}
