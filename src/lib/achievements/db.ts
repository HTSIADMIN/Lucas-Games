// Server-side achievement unlock helper. Game routes call this
// after a settlement to insert any newly-detected achievement ids.
// The primary key on game_achievements (user_id, source, achievement_id)
// makes the insert idempotent — duplicate-key conflicts on
// already-owned achievements are silently swallowed.
//
// Returns the subset that ACTUALLY landed (i.e. weren't already
// owned) so the caller can broadcast them via the response payload
// for the client to toast.

// Server-only by callsite (game routes / settle helper). Avoid the
// `server-only` package import — it isn't installed in this project,
// and the runtime: "nodejs" on every route guarantees server context.

export async function unlockAchievements(
  userId: string,
  source: string,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!useSupabase) return [];

  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Find which of the candidate ids the player already owns. PostgREST
  // `in` filter handles the array.
  const { data: existing } = await supa
    .from("game_achievements")
    .select("achievement_id")
    .eq("user_id", userId)
    .eq("source", source)
    .in("achievement_id", ids as string[]);

  const owned = new Set(
    ((existing ?? []) as { achievement_id: string }[]).map((r) => r.achievement_id),
  );
  const toInsert = ids.filter((id) => !owned.has(id));
  if (toInsert.length === 0) return [];

  // Upsert with ignoreDuplicates handles any concurrent race that
  // could double-insert. Returns the rows that landed.
  const rows = toInsert.map((id) => ({
    user_id: userId,
    source,
    achievement_id: id,
  }));
  const { error } = await supa
    .from("game_achievements")
    .upsert(rows, { onConflict: "user_id,source,achievement_id", ignoreDuplicates: true });
  if (error) {
    console.error("[unlockAchievements]", source, error.message);
    return [];
  }
  return toInsert;
}
