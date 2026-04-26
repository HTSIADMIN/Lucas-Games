import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  clanLeaderboard,
  ensureCurrentSeason,
  getMyClan,
  listClanChat,
  listClanHistory,
  listClanMembers,
  listClanPendingInvites,
  listMyPendingInvites,
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

  const [{ clan, membership }, leaderboard, chests, myInvites] = await Promise.all([
    getMyClan(s.user.id),
    clanLeaderboard(50),
    listMyUnopenedChests(s.user.id),
    listMyPendingInvites(s.user.id),
  ]);

  let members = null;
  let chat = null;
  let history = null;
  let pendingInvites = null;
  if (clan) {
    [members, chat, history] = await Promise.all([
      listClanMembers(clan.id),
      listClanChat(clan.id, 60),
      listClanHistory(clan.id, 12),
    ]);
    if (membership?.role === "leader") {
      pendingInvites = await listClanPendingInvites(clan.id);
    }
  }

  return NextResponse.json({
    enabled: true,
    season,
    myClan: clan,
    myMembership: membership,
    members,
    leaderboard,
    chests,
    myInvites,
    chat,
    history,
    pendingInvites,
  });
}
