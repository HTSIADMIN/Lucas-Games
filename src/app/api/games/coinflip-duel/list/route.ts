import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { listOpenCoinflipDuels, listRecentCoinflipDuels } from "@/lib/db";

export const runtime = "nodejs";

// Returns the open lobby + a tail of recent resolved duels for the history view.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [open, recent] = await Promise.all([
    listOpenCoinflipDuels(),
    listRecentCoinflipDuels(20),
  ]);

  // Hydrate with usernames via service-role lookup. Cheap because list is small.
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  let usersById: Record<string, { username: string; avatar_color: string; initials: string }> = {};
  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const ids = new Set<string>();
    for (const d of [...open, ...recent]) {
      ids.add(d.challenger_id);
      if (d.acceptor_id) ids.add(d.acceptor_id);
    }
    if (ids.size > 0) {
      const { data } = await supa
        .from("users_public")
        .select("id, username, avatar_color, initials")
        .in("id", Array.from(ids));
      if (data) {
        for (const u of data as Array<{ id: string; username: string; avatar_color: string; initials: string }>) {
          usersById[u.id] = { username: u.username, avatar_color: u.avatar_color, initials: u.initials };
        }
      }
    }
  }

  function hydrate(d: typeof open[number]) {
    return {
      ...d,
      challenger: usersById[d.challenger_id] ?? null,
      acceptor: d.acceptor_id ? usersById[d.acceptor_id] ?? null : null,
    };
  }

  return NextResponse.json({
    open: open.map(hydrate),
    recent: recent.map(hydrate),
  });
}
