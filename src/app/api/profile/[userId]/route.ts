import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getUserById, recentTransactions } from "@/lib/db";
import { getBalance } from "@/lib/wallet";
import { getUserLevel } from "@/lib/xpServer";
import { getChampionId } from "@/lib/champion";

export const runtime = "nodejs";

// Look up user stats. Pass "me" to look up the current user.
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { userId: rawId } = await ctx.params;
  const userId = rawId === "me" ? s.user.id : rawId;
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const useSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  let totalBet = 0;
  let totalWon = 0;
  let biggestWin = 0;
  let gamesPlayed: { game: string; count: number; net: number }[] = [];
  let achievementCount = 0;
  let recentAchievements: { source: string; achievementId: string; unlockedAt: string }[] = [];
  const firstSeen: string | null = user.created_at;

  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // user_profile_stats() runs the wallet + game_sessions + crash +
    // plinko + mines aggregation in a single SQL pass. Doing it in
    // JS on returned rows hit PostgREST's 1k-row default cap, which
    // silently truncated heavy users' totals + per-game counts —
    // looked like history had vanished. The RPC bypasses the cap.
    type StatsBlob = {
      totalBet: number | string;
      totalWon: number | string;
      biggestWin: number | string;
      gamesPlayed: { game: string; count: number | string; net: number | string }[] | null;
    };
    const { data: stats, error: statsErr } = await supa.rpc("user_profile_stats", {
      p_user_id: userId,
    });
    if (statsErr) {
      console.error("[user_profile_stats]", statsErr);
    } else if (stats) {
      const s = stats as StatsBlob;
      totalBet   = Number(s.totalBet ?? 0);
      totalWon   = Number(s.totalWon ?? 0);
      biggestWin = Number(s.biggestWin ?? 0);
      gamesPlayed = (s.gamesPlayed ?? []).map((g) => ({
        game: g.game,
        count: Number(g.count),
        net: Number(g.net),
      }));
    }

    // Achievement showcase — recent unlocks across every game source
    // unioned in the user_achievements view (migration 0045). Pull
    // the latest 5 + the total count for the count chip / "see all".
    try {
      const [countRes, recentRes] = await Promise.all([
        supa.rpc("achievement_count", { p_user_id: userId }),
        supa.rpc("recent_achievements", { p_user_id: userId, p_limit: 5 }),
      ]);
      if (typeof countRes.data === "number") achievementCount = countRes.data;
      else if (countRes.data != null) achievementCount = Number(countRes.data) || 0;
      const rows = (recentRes.data ?? []) as {
        source: string;
        achievement_id: string;
        unlocked_at: string;
      }[];
      recentAchievements = rows.map((r) => ({
        source: r.source,
        achievementId: r.achievement_id,
        unlockedAt: r.unlocked_at,
      }));
    } catch (e) {
      console.error("[recent_achievements]", e);
    }
  }

  const championId = await getChampionId();

  // Recent wallet activity — only surfaced on the requester's OWN
  // profile. Other users' ledger history stays private. 25 rows is
  // about a screenful of history; the helper sorts newest-first.
  const isMe = userId === s.user.id;
  const transactions = isMe
    ? (await recentTransactions(userId, 25)).map((t) => ({
        id: t.id,
        delta: t.delta,
        reason: t.reason,
        refKind: t.ref_kind,
        refId: t.ref_id,
        createdAt: t.created_at,
      }))
    : [];

  // Activity-based XP (replaces the old net-wins-derived level). One
  // RPC pulls games_played + achievements_unlocked + play_seconds.
  const xpInfo = await getUserLevel(userId);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      initials: user.initials,
      memberSince: firstSeen,
      isChampion: user.id === championId,
      equipped: {
        avatarColor: user.avatar_color,
        frame: user.equipped_frame ?? null,
        cardDeck: user.equipped_card_deck ?? "deck_classic",
        theme: user.equipped_theme ?? "saloon",
        hat: user.equipped_hat ?? null,
      },
    },
    stats: {
      balance: await getBalance(user.id),
      totalBet,
      totalWon,
      net: totalWon - totalBet,
      biggestWin,
      gamesPlayed,
    },
    xp: {
      xp: xpInfo.xp,
      level: xpInfo.level,
      currentLevelXp: xpInfo.currentLevelXp,
      nextLevelXp: xpInfo.nextLevelXp,
      intoLevelXp: xpInfo.intoLevelXp,
      toNextXp: xpInfo.toNextXp,
      gamesPlayed: xpInfo.gamesPlayed,
      playMinutes: xpInfo.playMinutes,
      achievementsUnlocked: xpInfo.achievementsUnlocked,
    },
    transactions,
    achievements: {
      total: achievementCount,
      recent: recentAchievements,
    },
  });
}
