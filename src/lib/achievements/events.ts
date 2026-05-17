// Client-side achievement-unlock event bus. Game clients dispatch
// `lg:achievement-unlocked` (a CustomEvent carrying the array of
// {source, id} pairs) whenever a route's response includes a
// non-empty `newlyUnlockedAchievements`. The shared
// <AchievementToast /> component listens for the event and pops a
// celebratory toast for each unlock.
//
// Window event was chosen over a React context because the toast is
// mounted once at the AppLive root, while unlock events fire from
// dozens of game clients — most of which don't have a clean path to
// a shared context dispatcher. Window events are zero-coupling.

export type AchievementUnlockedKey = { source: string; id: string };

export const ACHIEVEMENT_UNLOCK_EVENT = "lg:achievement-unlocked";

export function dispatchAchievementUnlocks(unlocks: AchievementUnlockedKey[]): void {
  if (typeof window === "undefined") return;
  if (!unlocks || unlocks.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<AchievementUnlockedKey[]>(ACHIEVEMENT_UNLOCK_EVENT, {
      detail: unlocks,
    }),
  );
}

/** Read the `newlyUnlockedAchievements` field from a game route's
 *  JSON response and dispatch the event for the toast component.
 *  No-ops cleanly if the field is missing or empty so every legacy
 *  caller stays a one-liner. */
export function dispatchAchievementsFromResponse(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const arr = (payload as { newlyUnlockedAchievements?: unknown }).newlyUnlockedAchievements;
  if (!Array.isArray(arr)) return;
  const unlocks: AchievementUnlockedKey[] = [];
  for (const entry of arr) {
    if (entry && typeof entry === "object") {
      const e = entry as { source?: unknown; id?: unknown };
      if (typeof e.source === "string" && typeof e.id === "string") {
        unlocks.push({ source: e.source, id: e.id });
      }
    }
  }
  dispatchAchievementUnlocks(unlocks);
}
