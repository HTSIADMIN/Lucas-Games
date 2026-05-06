// Player-facing changelog. Newest entry first — the WhatsNewModal
// pops the first time it sees an `id` it hasn't shown before, so to
// announce a new release just prepend an entry with a fresh id.
//
// Keep notes short and player-friendly: the audience is the people
// playing the games, not engineers reading commits.

export type ChangelogEntry = {
  /** Unique, stable id used as the "seen" key in localStorage. */
  id: string;
  /** Display date, ISO yyyy-mm-dd so it sorts naturally. */
  date: string;
  title: string;
  /** Bullet lines — rendered as a list. Plain strings, no markdown. */
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-05-05-changelog",
    date: "2026-05-05",
    title: "Update notes are here",
    notes: [
      "Whenever there's a new release we'll pop a quick note like this so you can see what's new without hunting for it.",
      "Hit \"Previous updates\" below to scroll through everything we've shipped.",
      "First entry: this very pop-up. Welcome to the changelog.",
    ],
  },
];
