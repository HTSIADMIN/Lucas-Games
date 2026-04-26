import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

// Top scores for Crossy Road. Aggregates over recent settled rows
// in game_sessions with game='crossy_road'.

type LBRow = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  bestScore: number;
  bestPayout: number;
  runs: number;
};

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return NextResponse.json({ rows: [] });

  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await supa
    .from("game_sessions")
    .select("user_id, state, payout, users:users!inner(username, avatar_color, initials)")
    .eq("game", "crossy_road")
    .eq("status", "settled")
    .order("payout", { ascending: false })
    .limit(500);

  if (!data) return NextResponse.json({ rows: [] });

  type UserBlob = { username: string; avatar_color: string; initials: string };
  type Row = {
    user_id: string;
    state: { score?: number } | null;
    payout: number | string;
    users: UserBlob | UserBlob[] | null;
  };

  const byUser = new Map<string, LBRow>();
  for (const r of data as unknown as Row[]) {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    const score = Number(r.state?.score ?? 0);
    const payout = Number(r.payout ?? 0);
    const cur = byUser.get(r.user_id);
    if (!cur) {
      byUser.set(r.user_id, {
        userId: r.user_id,
        username: u?.username ?? "?",
        avatarColor: u?.avatar_color ?? "var(--gold-300)",
        initials: u?.initials ?? "??",
        bestScore: score,
        bestPayout: payout,
        runs: 1,
      });
    } else {
      cur.runs++;
      if (score > cur.bestScore) {
        cur.bestScore = score;
        cur.bestPayout = payout;
      }
    }
  }

  const rows = Array.from(byUser.values())
    .sort((a, b) => b.bestScore - a.bestScore || b.bestPayout - a.bestPayout)
    .slice(0, 10);

  return NextResponse.json({ rows });
}
