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
