// Returns the user id of the current rank-1 player on the leaderboard,
// or null if there's nobody yet. Cheap query (already-indexed view).

let cache: { id: string | null; at: number } | null = null;
const TTL_MS = 30_000;

export async function getChampionId(): Promise<string | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.id;
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await supa.from("leaderboard").select("id").eq("rank", 1).maybeSingle();
  const id = (data as { id: string } | null)?.id ?? null;
  cache = { id, at: Date.now() };
  return id;
}

/** Force the leaderboard-rank-1 cache to forget what it knew. Called
 *  on any wallet-affecting action that could realistically flip the
 *  top spot, so the next read picks up the fresh winner. */
export function invalidateChampionCache(): void {
  cache = null;
}

// ------------------------------------------------------------------
// champion_since maintenance
// ------------------------------------------------------------------

// Track the last-observed champion in-process so we only issue a DB
// write when it changes (not on every snapshot poll). Survives
// per-request because Node holds module state for the life of the
// serverless instance; if the lambda recycles, the next call simply
// re-reads the row and decides whether to bump.
let lastObservedChampionId: string | null | undefined = undefined;

/**
 * Stamp `users.champion_since = now()` on the current champion when
 * the rank-1 id has changed (and clear any previously stamped row).
 * No-op when the champion is unchanged. Safe to call on every
 * snapshot poll — the in-process guard short-circuits the common case.
 *
 * Idempotent across pod restarts: after a cold start, the first call
 * re-stamps the current champion (matching now()) and then settles
 * in. The few-seconds-off-from-truth window is acceptable because
 * the UI rounds to minutes.
 */
export async function bumpChampionSince(currentChampionId: string | null): Promise<void> {
  // First call after process start: record the id but don't write —
  // we don't know yet whether the timestamp is already correct.
  if (lastObservedChampionId === undefined) {
    lastObservedChampionId = currentChampionId;
    return;
  }
  if (currentChampionId === lastObservedChampionId) return;

  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) {
    lastObservedChampionId = currentChampionId;
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Clear every other user's champion_since, then stamp the new
  // champion. Two writes but both are sparse (the index is partial),
  // so worst case is "1 row updated + 1 row updated".
  await supa
    .from("users")
    .update({ champion_since: null })
    .not("champion_since", "is", null)
    .neq("id", currentChampionId ?? "00000000-0000-0000-0000-000000000000");

  if (currentChampionId) {
    await supa
      .from("users")
      .update({ champion_since: new Date().toISOString() })
      .eq("id", currentChampionId)
      .is("champion_since", null);
  }
  lastObservedChampionId = currentChampionId;
}

/** Reads the current champion's `champion_since` timestamp. Returns
 *  null when there's no champion (empty leaderboard) or when the
 *  row hasn't been stamped yet. */
export async function getChampionSince(
  championId: string | null,
): Promise<string | null> {
  if (!championId) return null;
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await supa
    .from("users")
    .select("champion_since")
    .eq("id", championId)
    .maybeSingle();
  return (data as { champion_since: string | null } | null)?.champion_since ?? null;
}
