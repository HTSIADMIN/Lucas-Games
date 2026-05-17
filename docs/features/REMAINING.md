# Remaining work — competitive features

Status snapshot taken 2026-05-14. Builds on the seven design docs in
this folder. The four S/M features (catch-me chip, winnings ticker,
hot streak, achievement showcase) shipped together. The three L
features below are still queued — each is a multi-route build with
its own migration, components, and (for F5/F7) a cron worker.

## Shipped

- ✅ F1 — Catch-me chip + lost-rank toast — [01-catch-me-chip.md](./01-catch-me-chip.md)
  - Migration `0042_users_champion_since.sql` applied
  - `<CompetitiveChip>` in the desktop header
  - `snapshot.competitive` block populated every 10s
- ✅ F2 — Daily / Weekly winnings ticker — [02-winnings-ticker.md](./02-winnings-ticker.md)
  - Migration `0043_user_winnings_window.sql` applied
  - `<WinningsTicker>` stacked chips under the header balance pill
  - `Time-Zone` header used for local-day / local-week boundaries
- ✅ F3 — Hot streak badges — [03-hot-streak.md](./03-hot-streak.md)
  - Migration `0044_user_current_streak.sql` applied
  - `<StreakFlame>` renders on BetLine avatars, HeaderPresence pills, header balance pill
  - `LiveProvider.streaksByUser` map refreshed via batch RPC every 30s
- ✅ F6 — Achievement showcase on ProfileModal — [06-achievement-showcase.md](./06-achievement-showcase.md)
  - Migration `0045_achievement_showcase.sql` applied
  - `<AchievementShowcase>` strip + expanded grid in ProfileModal
  - Unified registry in `src/lib/achievements/registry.ts`

## Still TODO (L-effort each)

### 🔜 F4 — Generalized PvP duels — [04-pvp-duels.md](./04-pvp-duels.md)

Generalizes the existing `coinflip_duels` to cover dice / slot spin /
high card. New `duels` table + 5 routes + 4 components + per-game
resolution. Existing coinflip-duel page becomes a thin wrapper over
the generalized flow.

Files to add:
- `supabase/migrations/0046_pvp_duels.sql`
- `src/lib/games/duels/engine.ts` (per-game resolvers)
- `src/app/api/games/duels/create/route.ts`
- `src/app/api/games/duels/[id]/accept/route.ts`
- `src/app/api/games/duels/[id]/decline/route.ts`
- `src/app/api/games/duels/[id]/cancel/route.ts`
- `src/app/api/games/duels/route.ts` (list)
- `src/components/duels/DuelChallengeButton.tsx`
- `src/components/duels/DuelChallengeModal.tsx`
- `src/components/duels/DuelInboxBadge.tsx`
- `src/components/duels/DuelInboxModal.tsx`

Snapshot extension: `snapshot.pendingDuels` (count for the inbox badge).

Wallet reasons to add: `duel_stake_send`, `duel_stake_return`,
`duel_payout`. Add to `REASON_LABEL` in ProfileModal.

Estimated 4–6 hours.

### 🔜 F5 — Weekly tournament — [05-weekly-tournament.md](./05-weekly-tournament.md)

Depends on F2 (reuses `user_winnings_window`). Top 10 weekly net
splits a rake-funded pot. Hall of Fame tab on leaderboard. Cron
settles every Monday 00:01 UTC.

Files to add:
- `supabase/migrations/0047_weekly_tournament.sql` (2 tables + index)
- `src/lib/tournament/payout.ts` (`TOURNAMENT_PAYOUT_SPLIT` + helper)
- `src/lib/tournament/db.ts` (refresh + settle helpers)
- `src/app/api/tournaments/current/route.ts`
- `src/app/api/tournaments/[id]/route.ts`
- `src/app/api/tournaments/history/route.ts`
- `src/app/api/cron/settle-tournament/route.ts`
- `src/app/leaderboard/TournamentTab.tsx`
- `src/app/leaderboard/HallOfFameTab.tsx`
- `src/components/TournamentRankChip.tsx`
- `src/components/TournamentResultModal.tsx`

Add the 2% rake hook inside `src/lib/wallet/index.ts` after every
losing bet debit. New reasons: `tournament_rake`, `tournament_payout`.

`vercel.json` cron entry to fire `/api/cron/settle-tournament` at
`1 0 * * 1` (Monday 00:01 UTC).

Estimated 5–7 hours.

### 🔜 F7 — Co-op clan heist — [07-clan-heist.md](./07-clan-heist.md)

Builds on daily-challenges system + clans system. Clan members pool
`challenge_points` to crack a weekly vault. Pro-rata coin payout
split when threshold is hit.

Files to add:
- `supabase/migrations/0048_clan_heist.sql` (3 tables + indexes)
- `src/lib/clans/heist.ts` (goal/pot scaling helpers)
- `src/app/api/clans/heist/route.ts` (GET current week)
- `src/app/api/clans/heist/crack/route.ts` (POST, server-auth, idempotent)
- `src/app/api/cron/settle-heists/route.ts` (Monday rollover)
- `src/components/ClanHeistPanel.tsx`
- `src/components/ClanHeistChip.tsx` (optional lobby chip)

Hook into `src/lib/challenges/record.ts` so the existing
`claimDailyChallenge` writeback also bumps
`clan_heist_contributions.points` + `clan_heists.total_points` and
calls the crack route when the threshold flips. New reason:
`clan_heist_payout`.

Vault-cracked animation as a new keyframe set in `globals.css`
(~80 LOC).

Estimated 5–7 hours.

### 🔜 Achievements — finish wiring the 4 remaining game routes

System scaffolding shipped (migration 0048, catalogs, detect helpers,
unlockAndDetectAchievements helper, global fetch interceptor,
`<AchievementToast />`). 10 of 12 casino games already fire
achievements at settlement. The remaining 4 need their detection
hook added to the right settle path:

| Game | Settle path | Needs |
|---|---|---|
| blackjack (solo) | `src/app/api/games/blackjack/[sessionId]/action/route.ts` (stand / bust / final settle) | Wire `detectBlackjackAchievements`. Detection signature is in `src/lib/achievements/detect.ts` — needs `net`, `naturalBlackjack`, `fiveCardCharlie`, `doubledAndWon`, `dealerBust`, `playerTotal`, `playerCardCount`. |
| blackjack-mp | `src/app/api/games/blackjack-mp/action/route.ts` (final-hand resolution) | Wire `detectBlackjackMpAchievements`. Lighter context — same fields minus the doubled/perfect-21 paths. |
| poker | `src/app/api/games/poker/action/route.ts` + `src/app/api/games/poker/sit/route.ts` | Wire `detectPokerAchievements`. Needs `seated`, `net`, `allIn`, `bluffWin`, `potSize`. The poker engine should expose `allIn` and `wonByFold` flags on the hand-resolution result. |
| coinflip-duel | `src/app/api/games/coinflip-duel/create/route.ts` + `src/app/api/games/coinflip-duel/[id]/accept/route.ts` | Wire `detectCoinflipDuelAchievements`. Two-step: `first_challenge` fires on create; `first_accept` / `first_win` / `big_duel_win` fire on the accept (which resolves the duel). |

Pattern to follow (see `slots/spin/route.ts` or `coinflip/flip/route.ts`):
```ts
const ids = detectXxxAchievements({...});
const newlyUnlocked = await unlockAndDetectAchievements({
  userId: s.user.id,
  source: "xxx",
  perGameIds: ids,
  countAsBet: true, // false on cashout-side settles
  postBetBalance: balanceAfter,
});
return NextResponse.json({ ..., newlyUnlockedAchievements: newlyUnlocked });
```

Also nice-to-haves once data is plentiful:
- Roulette `hot_streak` (needs to query the prior round's win state).
- Mines `big_clear` fires on cashout but never on auto-bust mid-board.
- Cross-game "first_bet" sequence — the very first ever bet across all
  games should trigger Welcome to the Saloon; today that fires from
  the FIRST GAME ROUTE the player exercises, not strictly from a
  "first bet ever" detection. Tighten if it feels noisy.

## Shared follow-ups (when convenient)

- The preexisting `react-hooks/set-state-in-effect` lint errors in
  `AppSnapshotProvider.tsx` (line 173) and `LiveProvider.tsx` (line
  299, around the snapshot.chat → setChat merge path) are
  pre-existing under React 19's stricter rule. Refactor them to
  `useSyncExternalStore`-style subscriptions when touching that area
  next.
- When F4 / F5 / F7 add new wallet reasons, register each in:
  1. The credit/debit call site
  2. `REASON_LABEL` in `src/components/social/ProfileModal.tsx`
  3. (If gameplay-relevant) `gameSlugForReason` / `BET_REASONS` /
     `WIN_REASONS` in `src/lib/wallet/index.ts`
