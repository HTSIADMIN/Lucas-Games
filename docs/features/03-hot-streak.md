# Feature 3 — Hot streak badges

## Goal

A visible "this player is winning right now" social signal. When a player wins 3+ consecutive RNG games, their avatar gets a 🔥 STREAK ×N badge in the live-bet feed, the active-players strip, and on their own header balance pill. Resets on a loss. Purely cosmetic — no rewards.

Adds drama to the big-bet feed: a player on a 5-game streak in plain sight is "someone to beat".

## UX

**On the big-bet feed (ChatDrawer rows):**

The existing avatar gets a small flame badge in the corner with the streak count:

```
[Avatar 🔥3] Bob · slots
            bet 100K · 12s
                                +500K
```

Streak count uses ×N format (×3, ×8, ×24). Badge background is a gradient gold-orange. After ×10 it pulses gently.

**On the active-players strip (`HeaderPresence`):**

Player chip in the strip gets a small flame icon next to the username when on a streak ≥ 3.

**On the player's own header balance pill:**

Tiny corner flame when the user themselves is on a hot streak. Gives a "don't break it now" tension.

## Data model

No schema changes. Streaks compute from existing `game_sessions` rows.

We need a fast way to read "what's the current streak for user X". Two options:

- **(a) Compute on every read** — scan back from the most-recent `game_sessions.settled_at` and count wins until the first loss. Cheap because of the index on `(user_id, settled_at desc)` plus the typical streak is < 10 rows.
- **(b) Cache in a new table** — `user_streaks(user_id, length, last_game_id)` maintained by a trigger on `game_sessions`. Faster reads but more moving parts.

Going with **(a)** — wrap in a SQL function `current_streak(user_id)` that reads the last 50 settled `game_sessions` rows and counts consecutive wins from the top. Fast enough for snapshot poll cadence.

Win condition: `game_sessions.payout > game_sessions.bet`. Push (payout == bet) doesn't break a streak — neither does it extend one. Skip those rows.

A "session" for streak purposes only counts RNG games whose reason maps to a `WIN_REASONS` / `BET_REASONS` pair — same exclusion list as the winnings ticker. Earn-game submissions (Flappy, Snake, etc.) don't count.

Migration: `0044_user_current_streak.sql`. Adds the function and grants execute.

## Server surface

Extend `/api/app/snapshot` with **user's own** streak:

```ts
snapshot.streak = {
  length: number; // 0 when not on a streak
};
```

For OTHER players' streaks (shown in the big-bet feed + presence strip), the `LiveProvider` already enriches incoming `game_sessions` realtime events with user metadata; extend that path to also call `current_streak(userId)` once per enriched event and include `streak` in the resulting `LiveBet` payload. Same for the presence-strip — `HeaderPresence` already reads from the presence channel; extend the presence-channel payload OR look up per-user streak via a small batch RPC on each presence poll. Going with the batch RPC because presence channel payloads are kept small.

New helper: `currentStreaksFor(userIds: string[]): Promise<Record<string, number>>` → returns a map of user → streak length. Implemented as a single SQL query that calls the function per-id via a LATERAL subquery. PostgREST exposes it as `current_streaks_for(p_user_ids text[])`.

## Client surface

Three touchpoints:

- `BetLine` (in `ChatDrawer.tsx`) — read `b.streak` from the `LiveBet` payload, render a small badge in the avatar corner when ≥ 3.
- `HeaderPresence` — read per-user streak from snapshot's `presence` (extend with `streak`), render flame next to username.
- `AnimatedBalance` (or a sibling sticker on the header balance pill) — read `snapshot.streak.length`, render flame when ≥ 3.

New shared visual: `<StreakFlame n={number} />` component. Renders nothing when `n < 3`, a small badge when 3–9, a pulsing one when ≥ 10. ~20 lines, lives at `src/components/StreakFlame.tsx`.

## Dependencies

None. Builds on existing presence + live-bet plumbing.

## Effort

**M** — migration + SQL function, snapshot field, batch RPC, LiveProvider wiring, three render sites, one new shared component. Probably 2–3 hours.

## Acceptance

- [ ] `current_streak(user_id)` SQL function returns the right count for at least 3 hand-crafted test users (zero streak, 5-game streak, push doesn't break streak).
- [ ] Snapshot poll returns `streak.length` for the requester.
- [ ] LiveBet payloads in the chat feed include per-player streak when ≥ 3.
- [ ] Active-players strip shows flame next to usernames on streaks.
- [ ] Header balance pill shows flame when the user is on their own streak.
- [ ] Pure RNG bets only — earn-game payouts don't extend or break streaks.
- [ ] No streak badge below 3 — keep the badge meaningful.

## Open questions

- Should we cap the displayed streak at, say, "×99+" to keep the badge compact? Probably yes.
- Should a single multi-line slot win (e.g., 5 lines all win on one spin) count as 1 or 5 streak ticks? **1** — one settled game session = one streak event.
- Push (refund) games: drop entirely from the streak window (neither extend nor break).
