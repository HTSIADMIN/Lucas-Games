# Lucas Games

A pixel-saloon casino + free-games hub. Twelve bet-against-house games (slots, blackjack, blackjack-MP, crash, dice, mines, plinko, poker, roulette, scratch, coinflip, coinflip-duel) and six free earn games (Daily Spin, Frontier Monopoly, Crossy Road, Flappy, Snake, Penny Pinchers) with a global presence rail, big-bets feed, clans, daily challenges, leaderboards, and a cosmetics shop.

Stack: **Next.js 16 App Router** on **Supabase Postgres + Realtime**, deployed to **Vercel**. Client islands where they're needed; server components everywhere else.

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

Required env vars (set in `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
SESSION_SECRET=…           # any 32+ char random string
NEXT_PUBLIC_SITE_URL=…     # used for OG metadataBase
```

## Project layout

| Path | What lives there |
|------|------------------|
| `src/app/games/` | Bet-against-house games |
| `src/app/earn/` | Free-to-play earn games (cooldowns, no wager) |
| `src/app/lobby/`, `clans/`, `leaderboard/`, `shop/`, `sign-in/` | Hub pages |
| `src/app/api/` | Server endpoints — `runtime = "nodejs"` everywhere |
| `src/lib/games/` | Pure engines per game + the `freeGames.ts` registry |
| `src/lib/{auth,db,wallet,sfx,feed,events,clans,challenges,arcade,shop}/` | Subsystem modules |
| `src/components/` | Shared client components (header, modals, profile pill, etc) |
| `supabase/migrations/` | Append-only SQL — `0001_…` through `0039_…` |

For the full architecture writeup, design tokens, shared classes, and reuse rules, see [`CLAUDE.md`](CLAUDE.md).

## Scripts

```bash
pnpm dev      # next dev
pnpm build    # next build (Edge + Node bundles)
pnpm start    # next start (production server)
pnpm lint     # eslint
```

## Deploying

Vercel via the Next.js platform integration. Set the env vars above on the project; Supabase migrations are applied through the Supabase MCP (`apply_migration`) or the Supabase dashboard SQL editor against the production project.
