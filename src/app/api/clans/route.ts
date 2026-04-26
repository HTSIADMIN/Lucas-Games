import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  clanLeaderboard,
  ensureCurrentSeason,
  getMyClan,
  listClanMembers,
  listMyUnopenedChests,
  clansEnabled,
} from "@/lib/clans/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ enabled: false });

  // Ensure season + settle anything stale before reading the leaderboard.
  const season = await ensureCurrentSeason();

  const [{ clan, membership }, leaderboard, chests] = await Promise.all([
    getMyClan(s.user.id),
    clanLeaderboard(50),
    listMyUnopenedChests(s.user.id),
  ]);

  const members = clan ? await listClanMembers(clan.id) : null;

  return NextResponse.json({
    enabled: true,
    season,
    myClan: clan,
    myMembership: membership,
    members,
    leaderboard,
    chests,
  });
}
