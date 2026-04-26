// Server-side XP / level calculation. XP comes from NET profit on
// settled games — not from how much you wagered. Big wins on big bets
// reward you, but burning a thousand 100¢ bets that break even doesn't.

import { levelFromXp, xpFromCoinsWagered } from "./xp";

export async function getUserLevel(userId: string): Promise<{
  totalNetWon: number;
  xp: number;
  level: number;
  intoLevelXp: number;
  toNextXp: number;
}> {
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
      .select("bet, payout, status")
      .eq("user_id", userId)
      .eq("status", "settled");
    if (data) {
      for (const r of data as { bet: number | string; payout: number | string }[]) {
        const net = Number(r.payout) - Number(r.bet);
        if (net > 0) totalNetWon += net;
      }
    }
  }

  const xp = xpFromCoinsWagered(totalNetWon);
  const l = levelFromXp(xp);
  return { totalNetWon, xp, ...l };
}
