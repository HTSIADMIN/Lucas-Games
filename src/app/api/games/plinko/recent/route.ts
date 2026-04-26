import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

// Recent plinko drops from OTHER players, used to render ghost chips on
// your board. Only the last 30 seconds. Excludes the requesting user.

const WINDOW_MS = 30_000;
const MAX_ROWS = 20;

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return NextResponse.json({ drops: [] });

  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data } = await supa
    .from("plinko_drops")
    .select("id, user_id, rows, risk, bucket, multiplier, payout, created_at, users:users!inner(username, avatar_color, initials)")
    .neq("user_id", s.user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (!data) return NextResponse.json({ drops: [] });

  type UserBlob = { username: string; avatar_color: string; initials: string };
  type Row = {
    id: string;
    user_id: string;
    rows: number;
    risk: string;
    bucket: number;
    multiplier: number | string;
    payout: number | string;
    created_at: string;
    users: UserBlob | UserBlob[] | null;
  };

  const drops = (data as unknown as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      userId: r.user_id,
      username: u?.username ?? "?",
      avatarColor: u?.avatar_color ?? "var(--gold-300)",
      initials: u?.initials ?? "??",
      rows: r.rows,
      risk: r.risk,
      bucket: r.bucket,
      multiplier: Number(r.multiplier),
      payout: Number(r.payout),
      at: new Date(r.created_at).getTime(),
    };
  });

  return NextResponse.json({ drops });
}
