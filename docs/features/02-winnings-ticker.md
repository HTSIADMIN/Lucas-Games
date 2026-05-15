# Feature 2 — Daily / Weekly winnings ticker

## Goal

Reframe "competition" so newer players have a fair shot at being a leader. The all-time leaderboard rewards whoever's grinded longest (Penny Pinchers); a daily/weekly winnings view gives fresh competition every Monday morning.

Two new chips render under the header balance:

```
+15.6M  today
+340M  this week
```

Both go crimson and prefix with `−` when net is negative. Tier-coloured suffix per `tierColor`.

## UX

- Lives directly under the player's balance pill in the site header
- Auto-updates with every snapshot poll (10 s cadence)
- Tap (mobile) / hover (desktop) → tooltip showing breakdown:
  - "Today: bet 12.3M · won 27.9M · net +15.6M"
  - "This week: bet 1.45B · won 1.79B · net +340M"
- The chip itself stays compact (2 short lines, ~60 px tall)
- Period boundaries are local-day / local-week-Monday in the user's timezone so "today" matches the player's mental model

## Data model

No new tables. Adds one SQL function:

```sql
create or replace function public.user_winnings_window(
  p_user_id uuid,
  p_since   timestamptz
) returns table (bet numeric, won numeric, net numeric)
language sql stable as $$
  select
    coalesce(sum(case when reason like '%_bet' then -delta else 0 end), 0) as bet,
    coalesce(sum(case when reason like '%_win'
                       or reason like '%_payout'
                       or reason like '%_cashout'
                       or reason in ('slots_jackpot','slots_bonus_win',
                                     'roulette_settle','roulette_hot_bonus')
                  then delta else 0 end), 0) as won,
    coalesce(sum(delta), 0) as net
  from wallet_transactions
  where user_id = p_user_id
    and created_at >= p_since
    -- Exclude administrative buckets we don't want counted as wins.
    and reason not in ('signup_bonus','tip_send','tip_received','shop_buy',
                       'shop_pack_open','shop_pack_buy','clan_create',
                       'penny_pinchers_bank','daily_spin','monopoly_roll',
                       'monopoly_pack','monopoly_mystery_pay','monopoly_upgrade',
                       'flappy_score','snake_score','crossy_road_score',
                       'challenge_reward','clan_chest_open','arcade_upgrade');
$$;
```

Note: `net` IS `won - bet` mechanically because bet rows are negative deltas in the ledger. We expose all three so the tooltip can show the breakdown. The exclusion list is intentional — we want this metric to capture **risk-based gameplay** (slot/blackjack/crash/etc.), not free Penny Pinchers banking or shop purchases. Earn-game payouts inflate the number without competitive meaning.

Migration: `0043_user_winnings_window.sql`. Grant execute to authenticated + service_role.

## Server surface

Extend `/api/app/snapshot` payload (existing route):

```ts
snapshot.winnings = {
  today: { bet: number; won: number; net: number };
  week:  { bet: number; won: number; net: number };
};
```

Server computes the two `since` cutoffs in the user's timezone (passed via `Intl.DateTimeFormat().resolvedOptions().timeZone` from the client OR via the `Time-Zone` header — we'll use the request header first, fall back to UTC). Calls the SQL function twice, returns the two windows.

## Client surface

New component: [`src/components/WinningsTicker.tsx`](../../src/components/WinningsTicker.tsx)

- Subscribes to `useAppSnapshot()`, reads `snapshot.winnings`
- Renders two stacked chips below the balance pill
- Tooltip on hover/tap shows the bet+won breakdown
- Uses `formatAmount` for values, `tierColor` for suffix

Header placement: tucked into the existing balance-area region. On phones, the chips might collapse to a single "today: +15.6M" line via media query.

Timezone: client passes `Time-Zone` header on the snapshot fetch (and the load fetch). AppSnapshotProvider adds the header automatically using `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Dependencies

None. All required data is in `wallet_transactions`.

## Effort

**S–M** — one migration, one SQL function, snapshot field extension, one component, header wiring. Probably 1–1.5 hours.

## Acceptance

- [ ] Migration applied; `user_winnings_window` function callable via supabase-js RPC.
- [ ] `/api/app/snapshot` returns `winnings` block for every authed user.
- [ ] Today / Week chips render under the balance pill on every authed page.
- [ ] Negative net shows in crimson with `−` prefix; positive in cactus with `+`.
- [ ] Tooltip shows correct bet / won breakdown.
- [ ] Period boundary respects the player's timezone (verified with at least one non-UTC test user).
- [ ] Earn-game payouts (Penny Pinchers bank, Daily Spin, Monopoly, arcade) do NOT count toward the daily/weekly net — only RNG-game wins/losses do.

## Open questions

- Should "this week" reset on Monday UTC or Monday local? Going with **local** to match player intuition.
- Should we expose a "yesterday" or "last 7 days" tooltip too? Not on the first cut.
- A future feature: a weekly leaderboard ranked by `winnings.week.net`. That's [05-weekly-tournament.md](./05-weekly-tournament.md).
