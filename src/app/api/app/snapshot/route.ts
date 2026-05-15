import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getActiveEvent } from "@/lib/events/globalEvents";
import { getCooldown, getMonopolyState, recentChatMessages } from "@/lib/db";
import { clansEnabled, getBonusSpinTokens } from "@/lib/clans/db";
import { ensureTodayChallenges } from "@/lib/challenges/record";
import { qualifyBet, FEED_WINDOW_MS, MAX_FEED_ROWS } from "@/lib/feed/thresholds";
import { bumpChampionSince, getChampionSince } from "@/lib/champion";
import {
  startOfLocalToday,
  startOfLocalWeek,
  timezoneFromRequest,
  type WinningsWindow,
} from "@/lib/winnings";

export const runtime = "nodejs";

// Combined per-user app snapshot. Replaces five separate polling
// endpoints called from header/footer fixtures + the LiveProvider:
//
//   /api/wallet/balance       → balance
//   /api/events/active        → event
//   /api/earn/status          → earn (Daily Spin + Monopoly readiness)
//   /api/challenges/state     → dailyClaimable (count only)
//   /api/social/live          → chat + bets (Realtime fallback feed)
//
// Consumed by AppSnapshotProvider via a single ~10s poll. The
// LiveProvider used to do a separate 6s poll against /api/social/live;
// folding chat + bets here saves one round-trip per cycle. Realtime
// channels (chat insert / game_session update / presence) still push
// new rows instantly; the snapshot only carries the HTTP fallback.
export async function GET(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();
  const tz = timezoneFromRequest(req);

  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Catch-me chip / competitive context. Reads the top-50
  // leaderboard rows, finds the requesting user's row + the row
  // immediately above. Falls back to `null` rival if the user is #1
  // or off the leaderboard entirely.
  type CompetitiveBlock = {
    myRank: number | null;
    myBalance: number;
    totalPlayers: number;
    rival: {
      userId: string;
      username: string;
      avatarColor: string;
      initials: string;
      frame: string | null;
      hat: string | null;
      balance: number;
      gap: number;
    } | null;
    championId: string | null;
    championSince: string | null;
  };
  const competitivePromise: Promise<CompetitiveBlock> = (async () => {
    if (!useSupabase) {
      return {
        myRank: null,
        myBalance: 0,
        totalPlayers: 0,
        rival: null,
        championId: null,
        championSince: null,
      } satisfies CompetitiveBlock;
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // Top 50 is plenty — the chip only targets the row above the
    // requesting user. If the user is below rank 50, surface them as
    // "off the board" (encourages a climb to the cliff). One read,
    // returns rank as a window-function so we get it for free.
    const { data } = await supa
      .from("leaderboard")
      .select("id, username, avatar_color, initials, equipped_frame, equipped_hat, balance, rank")
      .order("rank", { ascending: true })
      .limit(50);
    type Row = {
      id: string;
      username: string;
      avatar_color: string;
      initials: string;
      equipped_frame: string | null;
      equipped_hat: string | null;
      balance: number | string;
      rank: number;
    };
    const rows = (data ?? []) as Row[];
    const totalPlayers = rows.length; // top-50 cap; for "you are #X of Y"
                                        // we'd need a separate count(*).
                                        // Out of scope for first cut.
    const championId = rows[0]?.id ?? null;
    // Stamp/clear champion_since when the champion changes — only
    // does a DB write on actual change, no-op otherwise.
    void bumpChampionSince(championId).catch(() => undefined);
    const championSince = championId ? await getChampionSince(championId).catch(() => null) : null;

    const myIdx = rows.findIndex((r) => r.id === s.user.id);
    if (myIdx < 0) {
      return {
        myRank: null,
        myBalance: 0,
        totalPlayers,
        rival: null,
        championId,
        championSince,
      } satisfies CompetitiveBlock;
    }
    const mine = rows[myIdx];
    const myRank = mine.rank;
    const myBalance = Number(mine.balance);
    const rivalRow = myIdx > 0 ? rows[myIdx - 1] : null;
    const rival = rivalRow
      ? {
          userId: rivalRow.id,
          username: rivalRow.username,
          avatarColor: rivalRow.avatar_color,
          initials: rivalRow.initials,
          frame: rivalRow.equipped_frame,
          hat: rivalRow.equipped_hat,
          balance: Number(rivalRow.balance),
          gap: Math.max(0, Number(rivalRow.balance) - myBalance),
        }
      : null;
    return {
      myRank,
      myBalance,
      totalPlayers,
      rival,
      championId,
      championSince,
    } satisfies CompetitiveBlock;
  })().catch(() => ({
    myRank: null,
    myBalance: 0,
    totalPlayers: 0,
    rival: null,
    championId: null,
    championSince: null,
  }) satisfies CompetitiveBlock);

  // Winnings ticker — today's + this week's net bet/won/net per the
  // user_winnings_window SQL function. Two RPC calls per snapshot
  // (cheap). Period boundaries are local-day / local-week in the
  // user's timezone (Time-Zone header) so "today" matches their
  // mental model.
  type WinningsBlock = { today: WinningsWindow; week: WinningsWindow };
  const winningsPromise: Promise<WinningsBlock> = (async () => {
    if (!useSupabase) {
      const empty: WinningsWindow = { bet: 0, won: 0, net: 0 };
      return { today: empty, week: empty } satisfies WinningsBlock;
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const todaySince = startOfLocalToday(tz).toISOString();
    const weekSince = startOfLocalWeek(tz).toISOString();
    type Row = { bet: number | string; won: number | string; net: number | string };
    const [todayRes, weekRes] = await Promise.all([
      supa.rpc("user_winnings_window", { p_user_id: s.user.id, p_since: todaySince }),
      supa.rpc("user_winnings_window", { p_user_id: s.user.id, p_since: weekSince }),
    ]);
    function pickRow(res: { data: Row[] | Row | null }): WinningsWindow {
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!data) return { bet: 0, won: 0, net: 0 };
      return {
        bet: Number(data.bet),
        won: Number(data.won),
        net: Number(data.net),
      };
    }
    return {
      today: pickRow(todayRes as { data: Row[] | Row | null }),
      week: pickRow(weekRes as { data: Row[] | Row | null }),
    } satisfies WinningsBlock;
  })().catch(() => {
    const empty: WinningsWindow = { bet: 0, won: 0, net: 0 };
    return { today: empty, week: empty } satisfies WinningsBlock;
  });

  // Hot streak — current run of consecutive wins for the requesting
  // user. Resets on a loss. Pushes (payout == bet) don't break or
  // extend. Reads via the `current_streak(user_id)` SQL function
  // (one RPC call).
  type StreakBlock = { length: number };
  const streakPromise: Promise<StreakBlock> = (async () => {
    if (!useSupabase) return { length: 0 };
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    try {
      const { data } = await supa.rpc("current_streak", { p_user_id: s.user.id });
      return { length: Number(data) || 0 };
    } catch {
      return { length: 0 };
    }
  })().catch(() => ({ length: 0 }));

  const betsPromise: Promise<unknown[]> = (async () => {
    if (!useSupabase) return [];
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const since = new Date(now - FEED_WINDOW_MS).toISOString();
    const { data, error } = await supa
      .from("game_sessions")
      .select(`
        id, user_id, game, bet, payout, settled_at, created_at,
        users:users!inner(username, avatar_color, initials, equipped_frame, equipped_hat)
      `)
      .eq("status", "settled")
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(150);
    if (error || !data) return [];
    // Batch streak lookup for everyone who shows up in the recent feed —
    // one RPC roundtrip enriches the whole window. Returns a
    // {user_id, length}[] which we shove into a map.
    const userIdsForStreak = Array.from(new Set((data as { user_id: string }[]).map((r) => r.user_id)));
    const streakByUser = new Map<string, number>();
    if (userIdsForStreak.length > 0) {
      try {
        const { data: streakRows } = await supa.rpc("current_streaks_for", {
          p_user_ids: userIdsForStreak,
        });
        for (const r of (streakRows ?? []) as { user_id: string; length: number }[]) {
          streakByUser.set(r.user_id, Number(r.length) || 0);
        }
      } catch {
        /* graceful fallback — feed renders without streaks */
      }
    }

    type UserBlob = {
      username: string;
      avatar_color: string;
      initials: string;
      equipped_frame: string | null;
      equipped_hat: string | null;
    };
    type Row = {
      id: string;
      user_id: string;
      game: string;
      bet: number | string;
      payout: number | string;
      settled_at: string | null;
      created_at: string;
      users: UserBlob | UserBlob[] | null;
    };

    const rows = data as unknown as Row[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const balByUser = new Map<string, number>();
    if (userIds.length > 0) {
      const { data: bals } = await supa
        .from("wallet_balances")
        .select("user_id, balance")
        .in("user_id", userIds);
      for (const b of (bals ?? []) as { user_id: string; balance: number | string }[]) {
        balByUser.set(b.user_id, Number(b.balance));
      }
    }

    return rows
      .map((r) => {
        const bet = Number(r.bet);
        const payout = Number(r.payout);
        const net = payout - bet;
        const cur = balByUser.get(r.user_id);
        const wealth = cur != null ? Math.max(0, cur - net) : undefined;
        const { multiplier, bigOdds, bigWealth, qualifies } = qualifyBet({ bet, payout, wealth });
        const u = Array.isArray(r.users) ? r.users[0] : r.users;
        return {
          id: r.id,
          userId: r.user_id,
          username: u?.username ?? "?",
          avatarColor: u?.avatar_color ?? "var(--gold-300)",
          initials: u?.initials ?? "??",
          frame: u?.equipped_frame ?? null,
          hat: u?.equipped_hat ?? null,
          game: r.game,
          bet,
          payout,
          net,
          multiplier,
          bigOdds,
          bigWealth,
          qualifies,
          streak: streakByUser.get(r.user_id) ?? 0,
          at: new Date(r.settled_at ?? r.created_at).getTime(),
        };
      })
      .filter((b) => b.qualifies)
      .map((b) => {
        // Drop the `qualifies` discriminator from the wire payload —
        // post-filter every row qualifies by definition.
        const { qualifies, ...rest } = b;
        void qualifies;
        return rest;
      })
      .slice(0, MAX_FEED_ROWS);
  })().catch(() => []);

  // Run independent reads in parallel — each tolerates failure.
  const [balance, event, dailyCd, monopoly, bonusTokens, challenges, messages, bets, competitive, winnings, streak] =
    await Promise.all([
      getBalance(s.user.id).catch(() => 0),
      Promise.resolve(getActiveEvent()),
      getCooldown(s.user.id, "daily_spin").catch(() => null),
      getMonopolyState(s.user.id).catch(() => null),
      clansEnabled() ? getBonusSpinTokens(s.user.id).catch(() => 0) : Promise.resolve(0),
      ensureTodayChallenges(s.user.id).catch(() => [] as Awaited<ReturnType<typeof ensureTodayChallenges>>),
      recentChatMessages(50).catch(() => []),
      betsPromise,
      competitivePromise,
      winningsPromise,
      streakPromise,
    ]);

  const dailyAvailableAt = dailyCd ? new Date(dailyCd.available_at).getTime() : null;
  const dailyCooldownReady = !dailyAvailableAt || dailyAvailableAt <= now;
  const dailySpinReady = dailyCooldownReady || bonusTokens > 0;

  const monoNextAt = monopoly?.next_roll_at ? new Date(monopoly.next_roll_at).getTime() : null;
  const monoReady = !monoNextAt || monoNextAt <= now;

  const dailyClaimable = challenges.reduce(
    (n, row) => n + (row.completed_at && !row.claimed_at ? 1 : 0),
    0,
  );

  return NextResponse.json({
    serverNow: now,
    balance,
    event,
    earn: {
      dailySpin: {
        ready: dailySpinReady,
        nextAt: dailyCooldownReady ? null : dailyAvailableAt,
        bonusTokens,
      },
      monopoly: {
        ready: monoReady,
        nextAt: monoReady ? null : monoNextAt,
      },
    },
    dailyClaimable,
    chat: messages,
    bets,
    competitive,
    winnings,
    streak,
  });
}
