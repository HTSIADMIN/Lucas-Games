# Feature 4 — Player-vs-player duels

## Goal

Direct head-to-head wagers. The existing `coinflip_duels` system already supports this for coin flips; generalize the schema and UI to cover dice rolls, single slot spins, and high-card draws too.

A "Challenge" button on someone's profile → modal: pick game + wager → server creates a duel → opponent gets a notification + can accept or decline → server resolves → winner takes pot, broadcast result to the live feed.

## UX

**Initiator flow:**

1. Open another player's `ProfileModal`. Click a new **Challenge** button.
2. Modal opens with:
   - Game picker (Coin Flip / Dice / Slot Spin / High Card)
   - Wager input (uses standard `BetInput`)
   - Game-specific picker (Coin Flip → heads/tails; Dice → over/under target; High Card → suit/colour bias)
   - "Send Challenge" button
3. On submit, the challenger's stake is debited and the duel is posted. They see a "waiting…" pill.

**Recipient flow:**

1. A notification badge appears on the chat / lobby (small red dot on a "Duels" tab in the header — to be designed).
2. Click → modal showing the challenge.
3. Accept (their stake is debited, server resolves immediately, both sides see the result) OR Decline (challenger's stake refunded).

**Result:**

- Both players see a modal with the outcome.
- Result also fires into the live-bet feed as a `duel_result` row (formatted like an existing big bet, with "vs. opponent_username" tag).
- 5-minute auto-decline if opponent doesn't respond.

## Data model

Generalize the existing `coinflip_duels` table → new `duels` table (or rename + add columns). Going with a **new** table to keep the migration safe; the legacy coinflip_duels table stays for back-compat reads (until manually retired).

Migration `0045_pvp_duels.sql`:

```sql
create table duels (
  id              uuid primary key,
  challenger_id   uuid not null references users(id) on delete cascade,
  opponent_id     uuid references users(id) on delete cascade,  -- null = open challenge
  wager           numeric not null,
  game            text not null,           -- 'coinflip' | 'dice' | 'slots' | 'highcard'
  challenger_pick jsonb not null,          -- game-specific shape: { side: "heads" } / { target: 50, dir: "over" } / etc.
  -- Resolution
  result          jsonb,                   -- engine outcome blob
  winner_id       uuid references users(id) on delete cascade,  -- null until resolved
  status          text not null,           -- 'open' | 'accepted' | 'resolved' | 'cancelled' | 'expired'
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,    -- now() + 5min
  resolved_at     timestamptz
);
create index duels_opponent_open_idx on duels (opponent_id, status) where status = 'open';
create index duels_challenger_idx    on duels (challenger_id, created_at desc);
alter table duels enable row level security;
```

Game-specific resolution lives in each game's existing engine — coinflip uses `Math.random() < 0.5`, dice uses `engine.spin(target, direction)`, slots calls `baseSpin` once for each player (or one shared spin compared), high-card draws two cards and compares ranks. All pure functions; the duel route picks the right engine.

## Server surface

```
POST /api/games/duels/create        body: { game, opponentId, wager, challengerPick }
POST /api/games/duels/[id]/accept   body: { opponentPick }  (only for games that need both picks)
POST /api/games/duels/[id]/decline
POST /api/games/duels/[id]/cancel   (challenger backs out before opponent accepts)
GET  /api/games/duels                                  (list open + pending for me)
```

Resolution lives in `create + accept` flow:
- For 1-pick games (slot spin, high card): the challenger's pick is recorded; on accept, the server resolves immediately and credits the winner.
- For 2-pick games (coin flip, dice): the opponent must supply their pick on accept (e.g., they call "tails" if challenger called "heads"). Then resolve.

Wallet reasons:
- `duel_stake_send` — debit on create / accept (stake locked)
- `duel_stake_return` — credit on decline / cancel / expire (full refund of one side's stake)
- `duel_payout` — credit on win (pot = 2 × wager)

Wallet hygiene: rake = 0 % for first cut (friends-only, no house cut). Easy to add later as a `duel_rake` reason.

Snapshot integration: include `pendingDuels.length` in the snapshot poll so a header badge can light up without polling its own endpoint.

## Client surface

- New component: `<DuelChallengeButton userId={...} />` — rendered in `ProfileModal` next to the existing "My Loadout" link, but only on OTHER users' profiles.
- New component: `<DuelChallengeModal opponentId={...} onClose={...} />` — modal form for setting up the challenge.
- New component: `<DuelInboxBadge />` — header chip showing the count of incoming pending duels, click to open the inbox modal.
- New component: `<DuelInboxModal />` — lists incoming + outgoing duels with accept/decline actions.
- Big-bet feed integration: `LiveBet` payloads with `kind: "duel"` render slightly differently (highlight both players' avatars side-by-side, "vs" badge, winner crown).

## Dependencies

None hard. Coinflip-duel existing code is the template — generalize the patterns. Snapshot extension can land before or after the feature flag.

## Effort

**L** — schema migration, four routes, four new components, big-bet feed integration, snapshot wiring, per-game resolution engines. Probably 4–6 hours.

## Acceptance

- [ ] Migration applied; `duels` table + indexes in place.
- [ ] Coin flip duel works end-to-end (create → accept → resolve → wallet credit).
- [ ] Dice duel works (creator picks over/under, opponent gets opposite side, single roll resolves).
- [ ] Slot spin duel works (both players see the same spin, higher line payout wins — or each player gets their own spin and higher payout wins; pick one).
- [ ] High card draws two cards, ranks compared, ties replay.
- [ ] Auto-decline after 5 min returns the challenger's stake.
- [ ] Cancellation by the challenger before accept also returns the stake.
- [ ] Duel results show in the live-bet feed with both players' avatars + the "vs" badge.
- [ ] Wallet history entries (`duel_stake_send`, `duel_stake_return`, `duel_payout`) appear correctly in the profile-modal Recent Activity panel.
- [ ] Reason labels added to `REASON_LABEL` in `ProfileModal.tsx`.

## Open questions

- Slot duel resolution: shared spin (both see same grid; higher line payout wins) or independent spins? Shared spin is more dramatic, simpler RNG audit trail. Going **shared**.
- High card: should we add it to the regular lobby or duel-only? Duel-only for now.
- "Open challenge" (no opponentId — first taker wins) — useful for a public duel board. Out of scope for first cut; the schema supports it (`opponent_id` nullable) so we can light it up later.
