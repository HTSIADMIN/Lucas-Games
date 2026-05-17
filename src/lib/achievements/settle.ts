// Compose per-game + cross-game (meta) achievement detection on the
// settle path of every casino game. Returns the flat list of newly
// unlocked {source, id} pairs that the route should echo back to
// the client so it can toast them.

// Server-only by callsite — see comment in db.ts. No `server-only`
// import (the package isn't in deps); every route that uses this
// helper already runs nodejs runtime.
import { unlockAchievements } from "./db";
import { detectMetaAchievements } from "./detect";

export type AchievementUnlockedKey = { source: string; id: string };

/** Games that "Sampled the Menu" expects you to have played. Keep in
 *  sync with the casino lobby's GAMES array — the lobby's complete
 *  set of bettable rooms. */
const META_TOTAL_GAMES_AVAILABLE = 12;
//   blackjack, blackjack-mp, coinflip, coinflip-duel, crash, dice,
//   mines, plinko, poker, roulette, scratch, slots

/** Wraps a per-game detection result with cross-game (meta)
 *  detection that runs on every bet. Both unlocks land in one
 *  response. The caller passes the per-game candidate ids
 *  produced by its detect* helper; we insert and dedup here.
 *
 *  Meta context is queried inline (count + distinct-game-count on
 *  game_sessions). That's one Postgres roundtrip per game settle —
 *  comparable to the existing wallet inserts.
 *
 *  All-failure modes are non-fatal: if a query throws or the
 *  service-role client isn't configured (dev/mock mode), we just
 *  skip the meta side and only ship per-game unlocks.
 */
export async function unlockAndDetectAchievements(input: {
  userId: string;
  source: string;
  perGameIds: readonly string[];
  /** Game slug for meta's distinctGames calculation. Defaults to
   *  `source` (correct for all per-game routes; meta-only callers
   *  can override). */
  gameSlug?: string;
  /** True if this is a fresh bet (i.e. meta should bump its total
   *  count). False for cashout / state-update calls that don't
   *  represent a new wager. */
  countAsBet: boolean;
  /** Post-bet wallet balance, used for the "drained wallet"
   *  achievement. Skip if you can't easily compute it. */
  postBetBalance?: number | null;
}): Promise<AchievementUnlockedKey[]> {
  const { userId, source, perGameIds, countAsBet } = input;
  const gameSlug = input.gameSlug ?? source;

  // 1. Per-game unlocks.
  const perGameNew = await unlockAchievements(userId, source, perGameIds);

  // 2. Meta unlocks.
  const metaIds = await detectMetaIdsForUser({
    userId,
    gameSlug,
    countAsBet,
    postBetBalance: input.postBetBalance ?? null,
  });
  const metaNew = await unlockAchievements(userId, "meta", metaIds);

  return [
    ...perGameNew.map((id) => ({ source, id })),
    ...metaNew.map((id) => ({ source: "meta", id })),
  ];
}

async function detectMetaIdsForUser(input: {
  userId: string;
  gameSlug: string;
  countAsBet: boolean;
  postBetBalance: number | null;
}): Promise<string[]> {
  if (!input.countAsBet) {
    // Mid-game updates (cashouts, mid-round state changes) don't
    // represent a new bet — meta only fires on bet-placing events.
    return [];
  }
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return [];
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // Total settled bets + distinct games. PostgREST's `count: "exact"`
    // head request returns the count without rows. Two cheap queries.
    const [{ count: totalBetsCount }, distinctRes] = await Promise.all([
      supa
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", input.userId)
        .eq("status", "settled"),
      supa
        .from("game_sessions")
        .select("game")
        .eq("user_id", input.userId)
        .eq("status", "settled"),
    ]);
    const totalBets = totalBetsCount ?? 0;
    const distinctGames = new Set(
      ((distinctRes.data ?? []) as { game: string }[]).map((r) => r.game),
    ).size;
    return detectMetaAchievements({
      isFirstBet: totalBets <= 1, // this just-settled row counts
      totalBets,
      distinctGames,
      totalGamesAvailable: META_TOTAL_GAMES_AVAILABLE,
      drainedWallet: input.postBetBalance === 0,
    });
  } catch (err) {
    console.error("[meta detection]", err);
    return [];
  }
}
