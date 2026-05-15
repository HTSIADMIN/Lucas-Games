# Feature 1 — Catch-me chip + toggle

## Goal

Make leaderboard competition visible at all times. Show the player exactly one rank above the current user, and the gap between them — a constant target chip in the header. When the user passes that target, the chip celebrates briefly and re-targets the next rival up. When the user is #1, it shows a "holding champion" pose.

A small arrow button on the chip lets the player hide / show it — some players will love it, some find it stressful.

## UX

**Default state (user is not #1):**

```
↑ Bob · 12.3M to catch                [⮜]
```

- Up-arrow + rival's username (clickable → opens their `ProfileModal`)
- "to catch" gap, formatted via `formatAmount`
- Tier-coloured suffix (12.3M renders the M in gold, 1.4B emerald, etc.) per the existing `AnimatedBalance` tier polish
- Right-side arrow chevron toggle to collapse

**Pass celebration (one-shot, ~2 s):**

When the user's rank improves, the chip flashes cactus-green + plays a brief swell:

```
✓ Passed Bob! · +5.6M ahead
```

After the celebration the chip retargets to the new rival above (or goes to champion mode if the user is now #1).

**Champion state (user is #1):**

```
👑 Champion · holding #1 for 3d         [⮜]
```

- Gold border, subtle pulse
- Streak counter ("3d", "12h", "47m") based on `championSince` timestamp
- Click → opens leaderboard page

**Collapsed state:**

When the player toggles off, the chip becomes a small arrow pill `[⮞]` they can click to re-expand. Preference persists in `localStorage`.

**Lost-rank toast (separate from the chip):**

When the user's rank drops on a snapshot poll, a small toast slides in from the right:

```
Bob just passed you · −12.3M behind
```

Auto-dismisses after 5 s. Dismissible. Throttled — at most one toast per snapshot poll regardless of how many ranks dropped.

## Data model

No schema changes. Uses the existing `leaderboard` view which already has `rank()` and `balance`.

Need to track `championSince` somewhere for the "holding for Nd" string. Options:
- (a) Compute on the server every snapshot from a `wallet_transactions`-derived materialized fact. Complex.
- (b) Track in `users.champion_since timestamptz` — a column that gets set when the user becomes #1, cleared when they fall off.
- (c) Cheap heuristic: only show the duration when client-side rank stayed #1 across multiple polls. Doesn't survive page refreshes.

Going with **(b)** — one new nullable column. Migration `0042_users_champion_since.sql`. A small `getChampionId()` companion that bumps the timestamp when the champion changes runs on the snapshot route.

## Server surface

Extend `/api/app/snapshot` payload (existing route, no new endpoint):

```ts
snapshot.competitive = {
  myRank: number | null;     // 1-indexed; null if not on the leaderboard
  myBalance: number;
  totalPlayers: number;
  rival: null | {
    userId: string;
    username: string;
    avatarColor: string;
    initials: string;
    frame: string | null;
    hat: string | null;
    balance: number;
    gap: number;             // rival.balance - my.balance
  };
  championId: string | null;  // user id of #1
  championSince: string | null; // ISO; ms-precision is fine
};
```

The route reads the leaderboard view for the top 50 (already does for other features), finds the requesting user's row + the one immediately above. Falls back to `null` rival if user is #1 or not yet on the board.

Add `bumpChampionSince(currentChampionId)` helper in `src/lib/champion.ts` that updates `users.champion_since` when the champion changes; called once per snapshot poll (cheap — a single UPDATE WHERE id IS NOT champion).

## Client surface

New component: [`src/components/CompetitiveChip.tsx`](../../src/components/CompetitiveChip.tsx)

- Subscribes to `useAppSnapshot()`, reads `snapshot.competitive`
- Tracks previous `myRank` in a ref; when rank drops → fire toast; when rank rises and rival changes → fire pass-celebration on the chip itself
- localStorage `lg.catchMeChip:hidden = "1"` for the toggle
- Renders in the site header alongside the existing `<HeaderPresence>` strip and balance pill

Header layout impact: chip sits in the center / left-of-balance region of the site header. On mobile, the chip wraps to its own line if the row is full.

Toast component: simple absolute-positioned card in the top-right of the viewport, slide-in from right (matches the existing `pp-trophy-slide` pattern in Penny Pinchers).

## Dependencies

None. All required data is already available.

## Effort

**M** — single migration, snapshot extension, new component + toast, header wiring, mobile media query. Probably 1–2 hours.

## Acceptance

- [ ] Snapshot poll returns `competitive` block for every authed user.
- [ ] Chip is visible by default in the header on lobby + game pages, hidden by default below 480 px until expanded.
- [ ] Username on the chip is clickable and opens the ProfileModal.
- [ ] Pass celebration triggers once when the user passes a rival, not on every poll.
- [ ] Rank-drop toast fires when the user is overtaken, throttled to one per poll.
- [ ] Toggle button persists across reloads via localStorage.
- [ ] Champion state shows correct "holding for Nd / Nh / Nm" relative duration.
- [ ] Gap renders via `formatAmount` with tier-coloured suffix.

## Open questions

- Should the toast fire when the player is offline (i.e., on next login)? Probably no — only fire for changes seen during the current session.
- Champion-streak should reset only when champion changes, not on temporary draws (rare but possible). The migration's `champion_since` column handles that naturally because we only UPDATE when champion id changes.
