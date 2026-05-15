# Feature 6 — Achievement showcase on profile

## Goal

Make a player's profile feel like a trophy cabinet. The profile modal
already has a Recent Activity wallet panel; add a parallel **Achievements**
panel that shows the player's last few unlocks + total unlocked count.

Future-proof: today only Penny Pinchers has achievements, but the
schema + UI are written generically so additional games (slots,
blackjack, etc.) can drop in their own catalogs without UI work.

## UX

Profile modal layout (existing — adds a panel between "Cosmetics" and
"Recent Activity"):

```
┌─────────────────────────────────────────────────┐
│ Bob · Level 24 · 1.2B total bet · 980M won      │
│ [Cosmetics: frame, hat, deck-back]              │
├─────────────────────────────────────────────────┤
│ TROPHIES — 17 unlocked                          │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                        │
│ │🏆│ │💰│ │🔥│ │🪙│ │👑│                        │
│ └──┘ └──┘ └──┘ └──┘ └──┘                        │
│  Frugal     Mining   Streaker  Coin    Champ    │
│   2d ago    3d ago   1w ago    2w ago  1w ago   │
│                                  [See all 17 →] │
├─────────────────────────────────────────────────┤
│ RECENT ACTIVITY (wallet history) …              │
└─────────────────────────────────────────────────┘
```

- Most recent 5 unlocks rendered as small "badge" tiles (60×60 px).
- Hover tooltip shows the full description.
- "See all N →" expands inline to a scrollable grid of all unlocks.
- Empty state: "No trophies yet — go grab some!" with a button →
  Penny Pinchers (the only source today).

**Lobby/header sticker** — small chip in `<HeaderPresence>` players-strip
showing a count: `Bob · 24 🏆` on hover. Tiny, doesn't dominate. Toggle-able
via the same setting that controls the catch-me chip.

## Data model

**Today** — `penny_pinchers_achievements (user_id, achievement_id, unlocked_at)`
is per-game (added in migration 0027). We want a single read path for "what
has user X earned recently across all games".

Two options:

- **(a) New unified `achievements` table**, with per-game source rows
  copied into it on unlock. Pro: trivial read path. Con: data duplication.
- **(b) New SQL view `all_achievements(user_id, source, achievement_id, unlocked_at)`**
  that unions the existing PP table now and any future per-game tables
  later. Pro: no duplication, source-of-truth stays per-game.

Going with **(b)** — a view, then a SQL function `recent_achievements(p_user_id, p_limit)`
that orders + caps the union. As we add other games' achievement tables,
update the view's UNION.

```sql
-- Migration 0047_achievement_showcase.sql

create or replace view public.user_achievements as
select user_id, 'penny_pinchers' as source, achievement_id, unlocked_at
  from penny_pinchers_achievements;
-- Future: union all
--   select user_id, 'slots', achievement_id, unlocked_at from slots_achievements
--   select user_id, 'blackjack', achievement_id, unlocked_at from blackjack_achievements
--   ...

create or replace function public.recent_achievements(
  p_user_id uuid,
  p_limit   int default 5
) returns table (source text, achievement_id text, unlocked_at timestamptz)
language sql stable as $$
  select source, achievement_id, unlocked_at
    from public.user_achievements
   where user_id = p_user_id
   order by unlocked_at desc
   limit p_limit;
$$;

create or replace function public.achievement_count(p_user_id uuid)
returns int language sql stable as $$
  select count(*)::int from public.user_achievements where user_id = p_user_id;
$$;

grant select on public.user_achievements to anon, authenticated, service_role;
grant execute on function public.recent_achievements(uuid, int)
  to anon, authenticated, service_role;
grant execute on function public.achievement_count(uuid)
  to anon, authenticated, service_role;
```

**Catalog metadata** — the label / description / icon for each achievement
lives in code, not the DB. We need a unified registry so the showcase can
render unlocks from any source.

New file `src/lib/achievements/registry.ts`:

```ts
export type AchievementDef = {
  source: string;          // "penny_pinchers"
  id: string;              // "made_of_money"
  label: string;
  description: string;
  /** Emoji or icon name → resolved via GameIcon. */
  icon: string;
  /** Rarity hint for visual treatment (border colour). */
  rarity: "common" | "rare" | "epic" | "legendary";
};

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Penny Pinchers — sourced from src/lib/games/penny-pinchers/catalog.ts
  { source: "penny_pinchers", id: "first_dollar",   label: "First Dollar",   description: "Bank your first 100 PC.", icon: "💰", rarity: "common" },
  { source: "penny_pinchers", id: "frugal",         label: "Frugal",         description: "Earn 100 Frugality.",     icon: "🪙", rarity: "rare" },
  // … etc
];

export const ACHIEVEMENTS_BY_KEY: Record<string, AchievementDef> = …;
```

The PP catalog stays the source-of-truth for PP unlocks (rules + rewards);
the registry just adds presentation metadata. Build a one-line cross-check
helper to assert all PP achievement ids in `src/lib/games/penny-pinchers/catalog.ts`
have a registry entry (warn in dev console, log-only in prod).

## Server surface

Profile endpoint (`/api/profile/[userId]`) already exists. Extend its
response:

```ts
profile.achievements = {
  total: number;
  recent: Array<{
    source: string;
    achievementId: string;
    unlockedAt: string; // ISO
  }>;
};
```

Server calls `recent_achievements(userId, 5)` and `achievement_count(userId)`,
hands the rows to the client. The client resolves them against
`ACHIEVEMENTS_BY_KEY` to render labels / icons / descriptions.

Snapshot extension (small, only for "you"):

```ts
snapshot.achievementCount = number;   // for the header sticker
```

## Client surface

- New component: `src/components/AchievementShowcase.tsx` — takes the
  list of recent unlocks + total, renders the 5-tile strip + the "see all"
  expansion.
- New shared component: `src/components/AchievementBadge.tsx` — renders
  one badge: icon, label, "Nd ago" timestamp, hover tooltip with
  description, rarity-coloured border.
- `ProfileModal.tsx` — pull `profile.achievements`, render
  `<AchievementShowcase />` above the wallet history panel.
- `HeaderPresence.tsx` — extend tooltip with `🏆 N` when count > 0.

Empty state: `<AchievementShowcase recent={[]} total={0} />` renders the
"No trophies yet" callout with a link to Penny Pinchers.

## Dependencies

- The Penny Pinchers achievement table already exists. No data backfill needed.
- `ProfileModal` mobile-responsive layout (already shipped) — needs to
  stack the trophy strip into a scrollable horizontal row at the same
  breakpoint that tightens the rest of the modal (`@media (max-width: 540px)`).

## Effort

**S–M** — one migration (view + two functions), one registry file, two
components, profile-endpoint extension, snapshot count, profile-modal
wiring. Probably 2–3 hours.

## Acceptance

- [ ] Migration applied; `user_achievements` view and helper functions exist.
- [ ] `/api/profile/[userId]` returns `achievements.total + recent` for any user.
- [ ] Profile modal renders the most-recent-5 strip + total count.
- [ ] Empty state on a player with zero unlocks shows the friendly CTA.
- [ ] "See all" expansion shows a scrollable grid of every unlock with timestamps.
- [ ] Rarity-coloured border per the registry rarity tag (common = stroke,
      rare = sky, epic = purple, legendary = gold + subtle pulse).
- [ ] Header presence tooltip shows `🏆 N` next to username.

## Open questions

- Should we surface a daily-task-style "you're 3 unlocks away from your
  next milestone" hint? Not in v1 — keep it pure cabinet for now.
- Hover-tooltip on touch devices: tap-to-pin pattern (one tap shows
  the tooltip, second tap dismisses). Use the existing `useTouchPin` or
  similar — search the repo to see if one already exists.
- Future-proof: when slots / blackjack / etc. ship their own achievement
  systems, each needs:
  1. A per-game `<game>_achievements` table.
  2. A UNION entry in the `user_achievements` view.
  3. Catalog entries appended to `ACHIEVEMENTS` in the registry.
  4. Each table's unlock path should fire a one-shot popup (we'll lift
     the PP popup pattern into a shared `<AchievementToast />` at that
     time — out of scope for v1).
