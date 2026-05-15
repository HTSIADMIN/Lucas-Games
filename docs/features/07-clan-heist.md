# Feature 7 — Co-op clan heist

## Goal

A weekly cooperative event where a clan pools its **daily-task points** to
"crack" a giant pixel-bank vault. When the clan-wide point total clears a
goal threshold, the vault busts open and pays a coin reward split among
contributing members in proportion to their contribution.

This sits on top of the existing daily-challenges system (added in
[migration 0020](../../supabase/migrations/0020_daily_challenges.sql)) —
those already produce a "challenge_points" stat that flows into
`clan_members.weekly_xp` + `clans.total_xp_week`. We reuse that exact
point source as the heist currency.

It's the social-pressure capstone: solo features 1-3 keep individual
players honest about their own progress, duels + tournament pit them
against each other, the heist gives clans a reason to coordinate.

## UX

**On the clans page** (existing `src/app/clans/page.tsx`) — add a heist
panel at the top above the chest grid:

```
┌────────────────────────────────────────────────────┐
│ 🏦 BANK HEIST — Week 24                             │
│                                                    │
│  ░░░░░░░░░░░░░░░░░░░░ Vault: 14,300 / 25,000 pts   │
│   ███████████████░░░░ 57%                          │
│                                                    │
│  Reward pot if cracked: 8.5M coins · 6 days left   │
│                                                    │
│  Top contributors this week:                       │
│   1. Bob     · 4,200 pts                           │
│   2. Charlie · 3,800 pts                           │
│   3. Diana   · 2,400 pts                           │
│   4. You     ·   900 pts                           │
└────────────────────────────────────────────────────┘
```

- Progress bar in saloon-gold; fills proportionally; pulse + flash when
  the threshold is hit.
- Click on a top-contributor row → opens their ProfileModal.

**The crack moment** — when the clan clears the threshold:

- All online clan members see a one-shot pixel-vault-busting animation
  (saloon-style: door slams open, coins pour out).
- Toast + sound: "🏦 VAULT CRACKED · 8.5M split among 6 contributors".
- Each contributor's share is credited immediately; a `clan_heist_payout`
  wallet row lands on their account with the contribution-weighted amount.
- After the crack, the panel collapses to "Next heist starts Monday".

**Solo/no-clan state:**

- If user has no clan, the panel shows: "Join a clan to participate in
  the weekly heist." → link to `/clans`.

**Mid-week join:**

- A new member's contribution starts counting from the moment they
  join. They keep eligibility for the rest of the week.

## Data model

Three new tables. Reuses the daily-challenges point source.

```sql
-- Migration 0048_clan_heist.sql

create table clan_heists (
  id              uuid primary key default gen_random_uuid(),
  clan_id         uuid not null references clans(id) on delete cascade,
  week_start      timestamptz not null,        -- Monday 00:00 UTC
  week_end        timestamptz not null,        -- next Monday
  goal_points     int not null,                -- threshold to crack
  reward_pot      numeric not null,            -- coins at risk
  status          text not null default 'active'
                    check (status in ('active', 'cracked', 'failed')),
  cracked_at      timestamptz,
  total_points    int not null default 0,      -- cached contribution sum
  unique (clan_id, week_start)
);

-- Per-member contribution this week
create table clan_heist_contributions (
  heist_id   uuid not null references clan_heists(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  points     int not null default 0,
  last_at    timestamptz not null default now(),
  primary key (heist_id, user_id)
);
create index clan_heist_contributions_heist_idx
  on clan_heist_contributions (heist_id, points desc);

-- Each split payout audit row (1 per contributor per cracked heist)
create table clan_heist_payouts (
  heist_id   uuid not null references clan_heists(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  points     int not null,                  -- snapshot at crack
  amount     numeric not null,              -- coins paid
  paid_at    timestamptz not null default now(),
  primary key (heist_id, user_id)
);

alter table clan_heists              enable row level security;
alter table clan_heist_contributions enable row level security;
alter table clan_heist_payouts       enable row level security;
```

**Where contributions come from:**

The daily-challenges system already accrues `challenge_points` on a
per-claim basis (see `claimDailyChallenge` in
`src/lib/challenges/record.ts`). When that fires:

1. (existing) Bumps `clan_members.weekly_xp` + `clans.total_xp_week`.
2. (new) Looks up the user's active heist for the current week and
   bumps `clan_heist_contributions.points` + `clan_heists.total_points`
   atomically.

So no new player-facing action is needed — claiming a daily challenge
already does the right thing once we extend the post-claim writeback.

**Goal calibration:**

The goal is a function of clan size: 25,000 points × (member count / 4) so
that a typical 4-person clan needs ~25k points / week (≈ 4-5 daily-task
claims per active member, lines up with current observed claim rates).
The pot scales similarly: 8.5M × (member count / 4). Constants live in
`src/lib/clans/heist.ts`:

```ts
export const HEIST_BASE_GOAL = 25_000;
export const HEIST_BASE_POT  = 8_500_000;
export const HEIST_REFERENCE_MEMBERS = 4;
export function goalForClan(memberCount: number): number { … }
export function potForClan(memberCount: number): number { … }
```

Tunable in code, not the DB, so weekly retuning is one PR not one
migration each time.

**Auto-create on week roll:**

Each Monday, a cron pass over `clans` creates a `clan_heists` row for
every clan with `member_count >= 2`. Solo-clans don't get a heist (would
just be a single-player coin gift; not the goal).

## Server surface

Snapshot extension — adds heist progress for the user's clan:

```ts
snapshot.heist = null | {
  id: string;
  goalPoints: number;
  totalPoints: number;
  rewardPot: number;
  myPoints: number;       // how much I contributed
  cracked: boolean;
  endsInMs: number;
  topContributors: Array<{ userId: string; username: string; points: number }>;
};
```

Routes:

```
GET  /api/clans/heist                 returns current week's heist for the user's clan
POST /api/clans/heist/crack           server-authoritative — checks threshold, if met,
                                      transitions to 'cracked' and pays out (idempotent).
                                      Called automatically by the daily-challenge claim
                                      route on the writeback that pushes total over the
                                      threshold; also callable by the cron.
POST /api/cron/settle-heists          Monday 00:01 UTC — for any 'active' heist whose
                                      week_end has passed: mark 'failed' if under threshold,
                                      create next week's row.
```

**Crack flow** — server-authoritative, atomic:

```
begin;
  select * from clan_heists where id = ? for update;
  if status != 'active' raise; -- already cracked or failed
  if total_points < goal_points raise; -- not yet
  update clan_heists set status='cracked', cracked_at=now();
  for each contributor:
    share := reward_pot * points / total_points;
    insert clan_heist_payouts;
    credit wallet with reason='clan_heist_payout';
commit;
```

Idempotent via the `for update` row lock + status guard — second crack
call short-circuits.

Wallet reason: `clan_heist_payout`.

## Client surface

- New component: `src/components/ClanHeistPanel.tsx`
  - Subscribes to `useAppSnapshot()`, reads `snapshot.heist`.
  - Renders the progress bar + top-contributors list.
  - On crack-state transition: fires the vault-bust animation + toast.
- Slot into existing `src/app/clans/page.tsx` above the chest grid (or
  inside the clan detail view if you're already in your clan's screen).
- A small chip variant for the lobby: `<ClanHeistChip />` shows "Heist
  57% · 6d left" → click links to `/clans#heist`. Optional, behind the
  same "extras" toggle as the catch-me chip.

Vault-bust animation: pure CSS keyframes (`clan-heist-vault-bust`)
animating a CSS-pixel-art vault door swinging open with coin spray.
~80 LOC, lives at the bottom of `globals.css` next to other game-fx
keyframes.

## Dependencies

- Daily-challenges system already exists (migration 0020). The heist
  reuses its `challenge_points` writeback hook.
- Clans system already exists (migrations 0018, 0019, 0021).
- Snapshot extension can land first (returns `null` if there's no
  active heist), then the writeback path, then the UI.

## Effort

**L** — three new tables, cron + crack route, snapshot field, panel +
vault animation + chip, writeback hook in daily-claim route. Probably
5–7 hours.

## Acceptance

- [ ] Migration applied; all three new tables exist with RLS enabled.
- [ ] Monday cron creates heist rows for every clan with ≥ 2 members.
- [ ] Daily-challenge claims add to the user's contribution + clan total atomically.
- [ ] When clan_total crosses goal, the crack endpoint pays every
      contributor pro-rata and writes the audit row.
- [ ] Snapshot returns `heist` block when the user is in a clan that
      has an active or just-cracked heist this week.
- [ ] Clans page shows the progress + top contributors + reward pot.
- [ ] Vault-cracked animation fires once per online member on the
      crack transition.
- [ ] Failed-heist (week ends below goal) marks the row failed; no
      payout; next week's heist auto-creates.
- [ ] `clan_heist_payout` reason added to `REASON_LABEL` (and
      `gameSlugForReason` / `BET_REASONS` / `WIN_REASONS` if relevant —
      probably no, it's a clan reward not a bet).
- [ ] Solo clan (`member_count = 1`) doesn't get a heist row.
- [ ] Joining mid-week starts the contribution counter from the join
      moment, not retroactively.

## Open questions

- **Carryover on a failed week**: should the pot roll into next week if
  not cracked? Going with **no for v1** — fresh slate each Monday so
  there's no "we'll never crack this" doom loop. If failed-weeks
  become a pattern we'll lower the goal.
- **Minimum contribution to qualify for payout**: should you need at
  least, say, 100 points to share the pot? Going with **no** — even 1
  point should get its proportional sliver. Encourages everyone to
  contribute even on a busy week.
- **Anti-abuse**: someone joining a clan an hour before the crack to
  steal a share. Mitigation: the `clan_heist_contributions.points` of
  the new member is initially 0; they only get a share if they
  actually claim a daily-challenge during their few hours of
  membership. So the abuse window is naturally bounded by daily-task
  reset cadence.
- **Heist failure consolation**: instead of pure-fail, give every
  contributor a small "tried our best" coin bump (say, 5% of their
  contribution × 100 coins). Probably skip — the goal is to make
  failure stingy enough that next week feels urgent.
- **Cosmetic carrot**: future expansion — a "Heist Crew" frame
  cosmetic unlocked after participating in N cracked heists. Out of
  scope for v1.
- **Visibility for non-clan members**: should the lobby chat tease
  "Bob's Clan just cracked a 12M vault!"? Yes — perfect feed-row
  material. The crack endpoint should emit a `LiveBet`-equivalent
  realtime event so the chat feed picks it up. Stretch goal.
