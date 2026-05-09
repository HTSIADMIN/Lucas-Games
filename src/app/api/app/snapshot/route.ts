import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getActiveEvent } from "@/lib/events/globalEvents";
import { getCooldown, getMonopolyState, recentChatMessages } from "@/lib/db";
import { clansEnabled, getBonusSpinTokens } from "@/lib/clans/db";
import { ensureTodayChallenges } from "@/lib/challenges/record";
import { qualifyBet, FEED_WINDOW_MS, MAX_FEED_ROWS } from "@/lib/feed/thresholds";

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
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();

  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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
          at: new Date(r.settled_at ?? r.created_at).getTime(),
        };
      })
      .filter((b) => b.qualifies)
      .map(({ qualifies: _q, ...rest }) => rest)
      .slice(0, MAX_FEED_ROWS);
  })().catch(() => []);

  // Run independent reads in parallel — each tolerates failure.
  const [balance, event, dailyCd, monopoly, bonusTokens, challenges, messages, bets] =
    await Promise.all([
      getBalance(s.user.id).catch(() => 0),
      Promise.resolve(getActiveEvent()),
      getCooldown(s.user.id, "daily_spin").catch(() => null),
      getMonopolyState(s.user.id).catch(() => null),
      clansEnabled() ? getBonusSpinTokens(s.user.id).catch(() => 0) : Promise.resolve(0),
      ensureTodayChallenges(s.user.id).catch(() => [] as Awaited<ReturnType<typeof ensureTodayChallenges>>),
      recentChatMessages(50).catch(() => []),
      betsPromise,
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
  });
}
