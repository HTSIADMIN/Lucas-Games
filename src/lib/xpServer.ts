// Server-side XP / level calculation. XP is derived from activity —
// games played + achievements unlocked — NOT net coin winnings. See
// xp.ts for the rationale.

import { levelFromXp, xpFromActivity } from "./xp";

export type XpStats = {
  gamesPlayed: number;
  playMinutes: number; // reserved — see XP_PER_PLAY_MINUTE in xp.ts
  achievementsUnlocked: number;
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  intoLevelXp: number;
  toNextXp: number;
};

export async function getUserLevel(userId: string): Promise<XpStats> {
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let gamesPlayed = 0;
  let playMinutes = 0;
  let achievementsUnlocked = 0;

  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // user_xp_inputs (migration 0047) returns a jsonb blob with
    // games_played + play_seconds + achievements_unlocked in one
    // round-trip. We divide play_seconds by 60 to get minutes for
    // the JS layer.
    try {
      const { data } = await supa.rpc("user_xp_inputs", { p_user_id: userId });
      const blob = (data ?? {}) as {
        games_played?: number;
        play_seconds?: number;
        achievements_unlocked?: number;
      };
      gamesPlayed = Math.max(0, Number(blob.games_played) || 0);
      playMinutes = Math.floor(Math.max(0, Number(blob.play_seconds) || 0) / 60);
      achievementsUnlocked = Math.max(0, Number(blob.achievements_unlocked) || 0);
    } catch {
      /* fall through to defaults — caller still gets L0 */
    }
  }

  const xp = xpFromActivity({ gamesPlayed, playMinutes, achievementsUnlocked });
  const l = levelFromXp(xp);
  return {
    gamesPlayed,
    playMinutes,
    achievementsUnlocked,
    xp,
    ...l,
  };
}
