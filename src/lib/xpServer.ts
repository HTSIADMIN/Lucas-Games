// Server-side helper: total wagered + level lookup.
// Single SUM query against wallet_transactions for *_bet rows.

import { levelFromXp, xpFromCoinsWagered } from "./xp";

export async function getUserLevel(userId: string): Promise<{
  totalWagered: number;
  xp: number;
  level: number;
  intoLevelXp: number;
  toNextXp: number;
}> {
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let totalWagered = 0;
  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supa
      .from("wallet_transactions")
      .select("delta, reason")
      .eq("user_id", userId);
    if (data) {
      for (const r of data as { delta: number; reason: string }[]) {
        const d = Number(r.delta);
        if (d < 0 && (r.reason.endsWith("_bet") || r.reason === "crash_bet")) {
          totalWagered += -d;
        }
      }
    }
  }

  const xp = xpFromCoinsWagered(totalWagered);
  const l = levelFromXp(xp);
  return { totalWagered, xp, ...l };
}
