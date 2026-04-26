import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const FEED_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const BIG_BET_THRESHOLD = 50_000;
const MAX_ROWS = 30;

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
      users:users!inner(username, avatar_color, initials)
    `)
    .eq("status", "settled")
    .gte("created_at", since)
    .order("id", { ascending: false })
    .limit(150);

  if (error || !data) return NextResponse.json({ bets: [] });

  type UserBlob = { username: string; avatar_color: string; initials: string };
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

  const bets = (data as unknown as Row[])
    .map((r) => {
      const bet = Number(r.bet);
      const payout = Number(r.payout);
      const net = payout - bet;
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      return {
        id: r.id,
        userId: r.user_id,
        username: u?.username ?? "?",
        avatarColor: u?.avatar_color ?? "var(--gold-300)",
        initials: u?.initials ?? "??",
        game: r.game,
        bet,
        payout,
        net,
        at: new Date(r.settled_at ?? r.created_at).getTime(),
      };
    })
    .filter((b) => Math.abs(b.net) >= BIG_BET_THRESHOLD)
    .slice(0, MAX_ROWS);

  return NextResponse.json({ bets });
}
