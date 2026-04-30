import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { qualifyBet, FEED_WINDOW_MS, MAX_FEED_ROWS } from "@/lib/feed/thresholds";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return NextResponse.json({ bets: [] });

  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const since = new Date(Date.now() - FEED_WINDOW_MS).toISOString();

  // Pull settled sessions in the last window with the user info.
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

  if (error || !data) return NextResponse.json({ bets: [] });

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

  // Batch-fetch current balances so the wealth-fraction check fires.
  // Pre-bet balance = current_balance - net; a 10-minute window is
  // narrow enough that current ≈ post-settle, and we accept the
  // approximation for older settles where the player has played more
  // since.
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

  const bets = rows
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

  return NextResponse.json({ bets });
}
