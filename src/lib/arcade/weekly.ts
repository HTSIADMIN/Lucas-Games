// Server-side helpers for arcade (Flappy + Crossy Road) personal
// bests and weekly leaderboards. All callers must be inside route
// handlers — we touch the service-role Supabase client directly.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { credit } from "@/lib/wallet";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env not configured");
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

export function arcadeEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type ArcadeGame = "flappy" | "crossy_road";

/** Top-1 weekly reward (10M coins). */
export const WEEKLY_TOP_REWARD = 10_000_000;

/** ISO week bounds (Monday 00:00 UTC → next Monday). Mirrors the
 *  clan-season window so both systems reset together. */
export function weekBounds(now = new Date()): { start: Date; end: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** YYYY-MM-DD for the Monday-aligned week_start used as the result
 *  table's primary key. */
export function weekKey(d = new Date()): string {
  const { start } = weekBounds(d);
  return start.toISOString().slice(0, 10);
}

/** Read a single user's personal best for a game. */
export async function getPersonalBest(userId: string, game: ArcadeGame): Promise<number> {
  if (!arcadeEnabled()) return 0;
  const col = game === "flappy" ? "flappy_best" : "crossy_best";
  const { data } = await client().from("users").select(col).eq("id", userId).maybeSingle();
  if (!data) return 0;
  return Number((data as Record<string, number>)[col] ?? 0);
}

/** Update a user's personal best for a game if `score` is higher.
 *  Returns the new best value (whether it changed or not). */
export async function updatePersonalBest(
  userId: string,
  game: ArcadeGame,
  score: number,
): Promise<{ best: number; isNew: boolean }> {
  if (!arcadeEnabled()) return { best: score, isNew: false };
  const col = game === "flappy" ? "flappy_best" : "crossy_best";
  const cur = await getPersonalBest(userId, game);
  if (score <= cur) return { best: cur, isNew: false };
  await client().from("users").update({ [col]: score }).eq("id", userId);
  return { best: score, isNew: true };
}

/** Top-N best score per user for a game, in the current week. Reads
 *  from game_sessions, group by user, max(state.score|state.rows). */
export type LBRow = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  bestScore: number;
};

export async function topWeekly(game: ArcadeGame, limit = 10): Promise<LBRow[]> {
  if (!arcadeEnabled()) return [];
  const { start, end } = weekBounds();
  const stateField = game === "flappy" ? "score" : "rows";

  const { data } = await client()
    .from("game_sessions")
    .select("user_id, state, users:users!inner(username, avatar_color, initials)")
    .eq("game", game)
    .eq("status", "settled")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(2000);

  type UserBlob = { username: string; avatar_color: string; initials: string };
  type Row = {
    user_id: string;
    state: Record<string, number | undefined> | null;
    users: UserBlob | UserBlob[] | null;
  };

  const byUser = new Map<string, LBRow>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    const score = Number(r.state?.[stateField] ?? 0);
    const cur = byUser.get(r.user_id);
    if (!cur) {
      byUser.set(r.user_id, {
        userId: r.user_id,
        username: u?.username ?? "?",
        avatarColor: u?.avatar_color ?? "var(--gold-300)",
        initials: u?.initials ?? "??",
        bestScore: score,
      });
    } else if (score > cur.bestScore) {
      cur.bestScore = score;
    }
  }
  return Array.from(byUser.values())
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, limit);
}

/** Lazy settle: if any week earlier than the current one is missing
 *  a result row, pick its top scorer and credit them the weekly
 *  reward. Idempotent — INSERTs collide on (game, week_start) so a
 *  race between two readers can't double-credit. */
export async function settleStaleWeeks(game: ArcadeGame): Promise<void> {
  if (!arcadeEnabled()) return;
  const cur = weekKey();
  // Most recent stored result; if it's already this week, nothing to settle.
  const { data: latest } = await client()
    .from("weekly_score_results")
    .select("week_start")
    .eq("game", game)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastSettled = (latest as { week_start: string } | null)?.week_start ?? null;

  // Walk back from "the week before current" until we hit a settled
  // week (or the wall — if no row at all, settle just last week so we
  // don't backfill years of empty weeks at first run).
  const cursor = weekBounds().start;
  cursor.setUTCDate(cursor.getUTCDate() - 7);
  const cap = new Date(cursor);
  cap.setUTCDate(cap.getUTCDate() - 30); // safety: at most 5 prior weeks

  while (cursor.toISOString().slice(0, 10) > (lastSettled ?? "0000-00-00")
         && cursor >= cap) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + 7);
    await settleOneWeek(game, start, end);
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  void cur;
}

async function settleOneWeek(game: ArcadeGame, start: Date, end: Date): Promise<void> {
  const stateField = game === "flappy" ? "score" : "rows";
  const { data } = await client()
    .from("game_sessions")
    .select("user_id, state")
    .eq("game", game).eq("status", "settled")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(2000);
  type Row = { user_id: string; state: Record<string, number | undefined> | null };

  let topUser: string | null = null;
  let topScore = 0;
  for (const r of (data ?? []) as Row[]) {
    const score = Number(r.state?.[stateField] ?? 0);
    if (score > topScore) {
      topScore = score;
      topUser = r.user_id;
    }
  }

  // Insert result row (idempotent via PK). If insert succeeds AND the
  // top scorer cleared a minimum bar, credit them the weekly reward.
  const weekStart = start.toISOString().slice(0, 10);
  const { error } = await client()
    .from("weekly_score_results")
    .insert({
      game,
      week_start: weekStart,
      top_user_id: topUser,
      top_score: topScore,
      reward: topUser && topScore > 0 ? WEEKLY_TOP_REWARD : 0,
    });
  if (error) {
    // Most likely a duplicate-key race; nothing else to do.
    return;
  }
  if (topUser && topScore > 0) {
    try {
      await credit({
        userId: topUser,
        amount: WEEKLY_TOP_REWARD,
        reason: `${game}_weekly_top`,
        refKind: "arcade_weekly",
        refId: `${game}:${weekStart}`,
      });
    } catch {
      // Already-credited race or grant failure — non-fatal; the
      // result row is now in place so the same week won't pay twice.
    }
  }
}

/** Most recently settled week for the lobby/leaderboard "last
 *  week's winner" line. Returns null if nothing has been settled. */
export async function lastSettledResult(game: ArcadeGame): Promise<{
  weekStart: string;
  topUserId: string | null;
  topUsername: string | null;
  topScore: number;
  reward: number;
} | null> {
  if (!arcadeEnabled()) return null;
  const { data } = await client()
    .from("weekly_score_results")
    .select("week_start, top_user_id, top_score, reward, users:users(username)")
    .eq("game", game)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  type Row = {
    week_start: string;
    top_user_id: string | null;
    top_score: number;
    reward: number;
    users: { username: string } | { username: string }[] | null;
  };
  const r = data as unknown as Row;
  const u = Array.isArray(r.users) ? r.users[0] : r.users;
  return {
    weekStart: r.week_start,
    topUserId: r.top_user_id,
    topUsername: u?.username ?? null,
    topScore: r.top_score,
    reward: r.reward,
  };
}
