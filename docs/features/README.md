# Competitive features — build plan

A batch of competitive / social-pressure features for Lucas Games. Each
feature has its own design doc in this folder. This README is the
master tracker — keeps the ordering, dependencies, and "what's shipped
vs. queued" picture in one place.

The features are listed in **build order**. Earlier ones either have
the smallest implementation surface or unlock data/migrations needed
by later ones. Each doc lists its own dependencies; this README is
the canonical sequence.

| # | Feature | Doc | Status | Tier |
|---|---------|-----|--------|------|
| 1 | Catch-me chip + toggle | [01-catch-me-chip.md](./01-catch-me-chip.md) | queued | S |
| 2 | Daily / Weekly winnings ticker | [02-winnings-ticker.md](./02-winnings-ticker.md) | queued | S |
| 3 | Hot streak badges | [03-hot-streak.md](./03-hot-streak.md) | queued | S |
| 4 | Achievement showcase on profile | [06-achievement-showcase.md](./06-achievement-showcase.md) | queued | A |
| 5 | Player-vs-player duels (generalized) | [04-pvp-duels.md](./04-pvp-duels.md) | queued | A |
| 6 | Weekly tournament | [05-weekly-tournament.md](./05-weekly-tournament.md) | queued | A |
| 7 | Co-op clan heist | [07-clan-heist.md](./07-clan-heist.md) | queued | B |

## How to read each design doc

Every doc follows the same shape:

- **Goal** — one or two sentences. What problem does this feature solve, what behaviour does the player see.
- **UX** — what the player actually sees, where, when. The "narrative".
- **Data model** — Postgres tables / views / function additions. Migration number reserved if applicable.
- **Server surface** — new or modified API routes, snapshot fields, RPC functions.
- **Client surface** — new or modified components, where they're rendered, props.
- **Dependencies** — earlier features or shared utilities that must land first.
- **Effort** — rough size estimate: S (≤ 1 hr), M (1–4 hr), L (≥ 4 hr).
- **Acceptance** — bulleted checklist of behaviour that should be true once the feature ships.

When a feature is implemented, prepend a `## Status — shipped <date> in <commit>` block to its doc so future Claude sessions can see at a glance which features are live and which are still queued.

## Shared constants / utilities

These exist already; new features should reuse them, not duplicate:

- `formatAmount(n)` / `formatRate(n)` in [`src/lib/format.ts`](../../src/lib/format.ts) — tier-formatted amounts (12.3K, 1.45B, etc.)
- `tierIndex` / `tierSuffix` / `tierColor` / `splitFormatted` — for tier-aware visual treatments
- `mulBigByNumber` / `toBig` / `toNum` in [`src/lib/big-math.ts`](../../src/lib/big-math.ts) — BigInt-precise payout math
- `useAppSnapshot()` in [`src/components/AppSnapshotProvider.tsx`](../../src/components/AppSnapshotProvider.tsx) — the single per-user 10s poll. New competitive fields fold into `snapshot.*` rather than spawning new pollers.
- `useLive()` from [`src/components/social/LiveProvider.tsx`](../../src/components/social/LiveProvider.tsx) — presence + chat + live bets via Supabase Realtime
- `useVisibleInterval()` in [`src/lib/hooks/useVisibleInterval.ts`](../../src/lib/hooks/useVisibleInterval.ts) — drop-in `setInterval` that pauses on hidden tabs

## Wallet / reason hygiene

When new features write to `wallet_transactions`, register the reason string in:

1. The credit/debit call (`reason: "tournament_payout"`, etc.).
2. `REASON_LABEL` in [`src/components/social/ProfileModal.tsx`](../../src/components/social/ProfileModal.tsx) — drives the human-friendly label on the wallet-history panel.
3. (If gameplay-relevant) `gameSlugForReason` / `BET_REASONS` / `WIN_REASONS` in [`src/lib/wallet/index.ts`](../../src/lib/wallet/index.ts) — drives daily-challenge progress + Lucky Hour boost.

Unknown reasons fall through to a title-cased version of the string, so missing one is recoverable but ugly.
