import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

// GET /api/earn/penny-pinchers/leaderboard
//
// Returns the top 10 Penny Pinchers players sorted by lifetime PC
// earned. Each row includes the player's wallet balance and current
// Frugality so the in-game footer can flex who's earning vs who's
// playing virtuously. Service-role client because we're reading
// across users.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: true, rows: [] });
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull the top 10 by lifetime PC. We embed users(...) for the
  // username + avatar fields and list wallet balances separately.
  const { data: pp, error } = await sb
    .from("penny_pinchers_state")
    .select(
      "user_id, lifetime_pc_earned, lifetime_clicks, frugality, prestige_count, users:users!inner(username, avatar_color, initials)",
    )
    .order("lifetime_pc_earned", { ascending: false })
    .limit(10);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, rows: [] });
  }

  const userIds = (pp ?? []).map((r) => (r as { user_id: string }).user_id);
  const balanceById: Record<string, number> = {};
  if (userIds.length > 0) {
    const { data: balances } = await sb
      .from("wallet_balances")
      .select("user_id, balance")
      .in("user_id", userIds);
    for (const row of (balances ?? []) as Array<{ user_id: string; balance: number | string }>) {
      balanceById[row.user_id] = Number(row.balance);
    }
  }

  type UserBlob = { username: string; avatar_color: string; initials: string };
  type Row = {
    user_id: string;
    // After migration 0046 these come back as strings (PostgREST
    // serializes `numeric` columns as strings to preserve precision).
    // Coerce to JS number for the wire shape consumers expect.
    lifetime_pc_earned: number | string;
    lifetime_clicks: number | string;
    frugality: number | string;
    prestige_count: number | string;
    users: UserBlob | UserBlob[] | null;
  };

  const rows = ((pp ?? []) as unknown as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      userId: r.user_id,
      username: u?.username ?? "?",
      avatarColor: u?.avatar_color ?? "var(--gold-300)",
      initials: u?.initials ?? "??",
      lifetimePCEarned: Number(r.lifetime_pc_earned),
      lifetimeClicks: Number(r.lifetime_clicks),
      frugality: Number(r.frugality),
      prestigeCount: Number(r.prestige_count),
      walletBalance: balanceById[r.user_id] ?? 0,
      isMe: r.user_id === s.user.id,
    };
  });

  return NextResponse.json({ ok: true, rows });
}
