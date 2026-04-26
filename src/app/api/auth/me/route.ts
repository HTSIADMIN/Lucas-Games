import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { levelFromXp, xpFromCoinsWagered } from "@/lib/xp";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });

  // XP / level — derived from net wins, not total wagered.
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let totalNetWon = 0;
  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supa
      .from("game_sessions")
      .select("bet, payout")
      .eq("user_id", s.user.id)
      .eq("status", "settled");
    if (data) {
      for (const r of data as { bet: number | string; payout: number | string }[]) {
        const net = Number(r.payout) - Number(r.bet);
        if (net > 0) totalNetWon += net;
      }
    }
  }

  const xp = xpFromCoinsWagered(totalNetWon);
  const lvl = levelFromXp(xp);

  return NextResponse.json({
    user: { id: s.user.id, username: s.user.username },
    balance: await getBalance(s.user.id),
    xp,
    level: lvl.level,
    currentLevelXp: lvl.currentLevelXp,
    nextLevelXp: lvl.nextLevelXp,
    intoLevelXp: lvl.intoLevelXp,
    toNextXp: lvl.toNextXp,
    totalNetWon,
  });
}
