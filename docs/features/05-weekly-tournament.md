# Feature 5 — Weekly tournament

## Goal

A weekly "who profited most this week" race with a real prize pot. Builds on the
winnings ticker from [02-winnings-ticker.md](./02-winnings-ticker.md) — the
ticker shows your own progress, the tournament makes it competitive.

Top 10 finishers split a coin pot funded by a small rake on all qualifying
bets that week. Tournament resets Monday 00:00 UTC. Final standings get a
"Hall of Fame" entry on the leaderboard page that persists forever.

Why a tournament instead of just a "weekly leaderboard view": the **pot** is
the hook. Players know a slice of every big-bet they place feeds the prize
they're chasing. Self-referential closed-loop economy = always-on tension.

## UX

**On the leaderboard page** — add a new tab next to "All-time":

```
[ Weekly tournament ]   [ All-time ]   [ Hall of Fame ]
```

Weekly tournament tab:

- Big sign at the top: `WEEK 24 · PRIZE POT 14.3M · ENDS IN 2d 14h`
- Pot value updates with each snapshot poll (it's a sum of contributions
  over the week so far).
- Top-10 table: rank, avatar+username, net winnings (large), recent net
  delta (sparkline of last 24h vs. last 168h).
- Highlight the requesting player's row (already-existing pattern in
  the all-time leaderboard).
- Below the top-10: "your rank: 24" or "you're not yet on the board"
  (under 10 entries / no qualifying bets yet).
- Prize distribution display:

  ```
  1st  40% · ≈ 5.7M
  2nd  20% · ≈ 2.8M
  3rd  12% · ≈ 1.7M
  4th    8% · ≈ 1.1M
  5th    6% · ≈ 860K
  6-10   each 2.8% · ≈ 400K
  ```

Hall of Fame tab:

- One row per completed week, newest first.
- `WEEK 23 · POT 9.8M · WINNER: Bob (+340M)` → click expands to show the full
  top-10 for that week with their actual coin payouts.
- Persists indefinitely. This is the "look how I clutched it" memorabilia.

**On the header** (optional, controlled by the same toggle as the catch-me chip):

A small `🏆 WK · #4` chip when the user is in the top 10 of the active
tournament. Click → opens leaderboard on the tournament tab.

**End-of-week settlement:**

- Cron job runs Monday 00:00 UTC: settles standings, credits payouts,
  writes a `tournament_results` row per finisher, pops a one-shot
  "You finished #N · won X coins" modal on next login for top-10
  finishers.
- Sub-Monday-midnight bets count for that week (Monday is the new-week
  reset boundary).

## Data model

Two new tables + extend wallet rake routing.

```sql
-- Migration 0046_weekly_tournament.sql
create table tournaments (
  id           uuid primary key default gen_random_uuid(),
  week_start   timestamptz not null,                       -- Monday 00:00 UTC
  week_end     timestamptz not null,                       -- next Monday 00:00 UTC
  pot_total    numeric not null default 0,                 -- accumulated rake
  status       text not null default 'active'              -- 'active' | 'settled'
                check (status in ('active', 'settled')),
  settled_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (week_start)
);

create table tournament_entries (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  -- Cached current standings (refreshed by a snapshot helper)
  bet           numeric not null default 0,
  won           numeric not null default 0,
  net           numeric not null default 0,
  rank          int,                                       -- null until settle
  payout        numeric,                                   -- null until settle
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index tournament_entries_net_idx on tournament_entries (tournament_id, net desc);

alter table tournaments        enable row level security;
alter table tournament_entries enable row level security;
```

**Pot funding (rake):**

A 2% rake is taken on every **losing** bet this week and added to the pot.
Wins don't get raked because that would feel double-punishing on top of the
loss the player already absorbed. Implementation: in `wallet/index.ts` after
the bet-debit lands, look up the active tournament id and bump `pot_total`
by `bet * 0.02`. Track the rake on the wallet_transactions row via a new
`tournament_rake` reason so it's auditable.

Alternative considered: rake from wins only. Rejected — the math is the
same on the pot side (every bet has equal-ish expected value), but feels
worse to the winner.

**Computing standings:**

The `tournament_entries` rows are a materialized view of weekly net per
user, refreshed by a SQL function `refresh_tournament_entry(p_user_id,
p_tournament_id)` called every time a wallet_transactions row lands for
that user during the active week. Tradeoffs:

- (a) Triggers on `wallet_transactions` → automatic but adds DB write
  overhead.
- (b) Refresh-on-snapshot — every snapshot poll for user X recomputes user
  X's `tournament_entries` row. Cheap (~one window-sum query).
- (c) Lazy-on-leaderboard-fetch — when somebody opens the leaderboard tab,
  refresh the top 100 rows.

Going with **(b) + (c)**: the snapshot poll keeps the user's own entry
fresh (so the header `🏆 #4` chip is reactive), and (c) ensures the
leaderboard view is fresh on demand. We never need full-table refresh.

Exclusion list: same as the winnings ticker — RNG bets only. Penny
Pinchers bank, daily spin, monopoly, arcade earn-game payouts don't
extend or count for tournament standings.

## Server surface

Snapshot extension:

```ts
snapshot.tournament = {
  id: string;
  weekStart: string;    // ISO
  weekEnd: string;      // ISO
  potTotal: number;
  myRank: number | null;     // null if not on the board
  myNet: number;
  endsInMs: number;
};
```

New routes:

```
GET  /api/tournaments/current             returns the active tournament + top 50
GET  /api/tournaments/[id]                returns one settled tournament's full table
GET  /api/tournaments/history             returns last 26 weeks of summary rows for Hall of Fame
POST /api/tournaments/settle              (admin / cron only) — settles a tournament
```

Cron: a Vercel cron route at `/api/cron/settle-tournament` runs every
Monday 00:01 UTC. It calls `POST /api/tournaments/settle` for any
tournament with `status='active' AND week_end <= now()`. The settle
endpoint refreshes all entries one final time, assigns ranks, computes
payouts via the prize distribution table, and credits payouts in a single
transaction. Reason `tournament_payout`.

If no cron is configured: the next snapshot poll after a tournament window
expires can also kick the settle as a fallback. Idempotent because
`status='active' AND week_end <= now()` matches only once.

Prize distribution (top 10, sums to 100%):

```ts
const TOURNAMENT_PAYOUT_SPLIT = [40, 20, 12, 8, 6, 2.8, 2.8, 2.8, 2.8, 2.8];
```

Helper `payoutForRank(rank: number, pot: number): number` lives in
`src/lib/tournament/payout.ts`. Returns 0 for rank > 10.

## Client surface

- New page section: `src/app/leaderboard/TournamentTab.tsx` rendered as a
  tab inside the existing LeaderboardClient. Fetches `/api/tournaments/current`.
- New page section: `src/app/leaderboard/HallOfFameTab.tsx`.
- New header chip: `<TournamentRankChip />` rendered next to
  `<CompetitiveChip>`. Shows only when `snapshot.tournament.myRank <= 10`.
- New one-shot modal: `<TournamentResultModal />` triggered when the user
  has an unclaimed `tournament_entries.payout` and `rank <= 10`. Pops on
  next login. Marks claimed by deleting a "needsToast" flag (server can
  use the existing `claimed_at` pattern, or a new column — going with a
  new `notified_at` so payout/notified split cleanly).

## Dependencies

- Builds on [02-winnings-ticker.md](./02-winnings-ticker.md) — same
  exclusion list, same window math. The `user_winnings_window` SQL
  function from that feature is reused inside `refresh_tournament_entry`.

So: ship the winnings ticker first (it's the data-model foundation), then
this tournament.

## Effort

**L** — two new tables, cron settlement, three routes + payout helper,
two new tabs in the leaderboard, header chip, end-of-week modal.
Probably 5–7 hours.

## Acceptance

- [ ] Migration applied; `tournaments` + `tournament_entries` in place; current
      week tournament auto-created.
- [ ] Rake (2% of every losing bet) accumulates into `pot_total` for the active week.
- [ ] Snapshot poll returns the user's current rank + the pot total.
- [ ] Leaderboard tournament tab renders the live top-10 with pot value + countdown.
- [ ] Settle cron runs Monday 00:01 UTC, credits top-10 finishers, writes results.
- [ ] Hall of Fame tab shows the last 26 weeks of settled tournaments.
- [ ] Top-10 finisher gets a one-shot result modal next login.
- [ ] `tournament_rake` + `tournament_payout` reasons added to `REASON_LABEL`.
- [ ] Reason gameplay-relevance flagged in `gameSlugForReason` / `BET_REASONS`
      / `WIN_REASONS` only if it affects daily-challenge progress (probably no).

## Open questions

- **Rake percentage**: 2% feels right for a small friend group. Bigger
  pots = more incentive to grind = more rake = bigger pot. Self-balancing.
  Adjustable via a constant.
- **Minimum-pot floor**: should we seed the pot with a small base
  contribution (say 1M coins) so even a quiet week still has a meaningful
  prize? Probably yes. Trivial to add as part of the cron's
  "create next week's tournament" step.
- **Stop the rake during cooldown**: do we pause the rake for ~5 min around
  the settle? Nah — the rake is on bets, which are still happening.
  Whichever active tournament is open at bet-time gets the rake.
- **Tie-breaking**: identical `net` values — break by total `bet`
  (more action wins) and then by `created_at` of the user account (older
  account loses, encouraging new-player wins). Documented in
  `refresh_tournament_entry`.
- **Ineligible users**: bots / system / admin accounts shouldn't enter.
  None exist today; if any do later, exclude them by an `is_eligible`
  boolean on the users table.
