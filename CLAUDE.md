@AGENTS.md

# Lucas Games — project notes

A pixel-saloon casino + free-games hub. Next.js 16 App Router (server components by default, client islands where needed) on Supabase Postgres + Realtime, deployed to Vercel. The art style is "cozy pixel tavern × western × PS1-era pixel art" — bitmap M6X11 type, chunky outlines, hard drop shadows, no blur, no rounded corners except poker chips.

The handoff bundle under `Lucas Games-handoff/lucas-games/project/` is a living mirror of the live app (refreshed alongside this file). The live source still wins on any conflict — when those two disagree, trust `src/`.

## Architecture at a glance

- **Pages** — `src/app/<route>/page.tsx`. Authed pages call `readSession()`, fetch what they need server-side, and render inside `<AppLive>` so the site header has access to live presence.
- **Layout chrome** — every authed page renders:
  ```
  <AppLive me={me} initialChat={initialChat} game="…" championId={…}>
    <SiteHeader current="…" centerSlot={<HeaderPresence />} rightSlot={…} />
    <main className="page">…</main>
  </AppLive>
  ```
  Game pages wrap that in [`GameShell`](src/components/GameShell.tsx), which also passes a `<HeaderBalance>` into `rightSlot` and adds a `<FreeGamesButton compact />` next to ← Lobby on the four free games.
- **Realtime** — `src/components/social/LiveProvider.tsx` runs three Supabase channels (presence, postgres_changes on chat + game_sessions) plus 3-second chat and 4-second big-bets polling fallbacks. Anything that needs live state calls `useLive()` from inside the provider.
- **Server APIs** — `src/app/api/<area>/<endpoint>/route.ts`. Conventions: `runtime = "nodejs"`, `readSession()` first, return `{ error: "…" }` with the right status on failure.
- **Game engines** — `src/lib/games/<game>/engine.ts` are pure functions (no side effects). Routes call them, persist via `src/lib/db`, and credit/debit via `src/lib/wallet`.

## Recent UI overhauls (April 2026)

These are the load-bearing changes a future session needs to know about:

- **Header refactor** — `<AppLive>` now wraps the entire authed shell (header + main), not just main. Removed the in-page "PresenceRail"; the active-players strip is rendered centred in the site header via `<HeaderPresence>`. On game pages a `<HeaderBalance>` pill replaces the in-page balance-bar so cash stays visible while playing. The lobby still keeps an in-page balance-bar beside Free Games + Sign Out chips.
- **Free Games modal + readiness** — `<FreeGamesButton>` lives in the lobby balance row (and on free-game pages via `GameShell`). It polls `/api/earn/status` every 30s and shimmers gold (`.is-ready`) whenever any free game is ready. The modal shows live countdowns ("23m 04s") on Daily Spin / Monopoly tiles or a green READY badge when their cooldown is up. Crossy/Flappy stay as static FREE.
- **Big Bets & Odds** — `LiveBet` carries `multiplier` + `bigOdds`. The feed surfaces wins paying ≥50× the wager regardless of bet size (so a 1%-shot longshot from a tiny stake still pops). `BetLine` shows a glowing gold `100×` badge on those wins. Tab is renamed "Big Bets & Odds".
- **Chat-button attention** — when a new chat message arrives from someone else and the chat tab isn't already open, the launcher fires a one-shot shake + sonar ping (two staggered rings, gold + crimson) on top of the existing pulse + tab-title flash + unread badge. Driven by a `pingKey` ref + state.
- **Lobby grid** — single `.grid .grid-4 .lobby-tile-grid` container. Tiles are arranged in category order (cards → coins → dice → other) without separate sections. Multiplayer tables (Blackjack Table, Poker, Coin Flip Duel) show a sky-blue `2P+` badge next to OPEN.
- **Density** — `.page-game` adds tighter padding/gaps so the action area fits at 100% zoom on 768–900px laptops. On phones the rules tighten further (panel padding `sp-3`, panel-title `fs-body`, etc.). Game canvases that were too tall got per-game caps: Slots reels capped at 460px (320px mobile), Crash readout 88→56 + canvas height 140 + `.crash-side` reordered above `.crash-stage` on phones, Dice readout 64→40 on phones, Coin Flip coin 240→180.
- **BetInput** — first preset press from a fresh control replaces the default 100 stake (`+1k → 1,000`, not 1,100); stacks afterwards. ÷2 and ×2 live in a row below the presets. COINS amount font is `fs-h3` (32px desktop) so the pill stays narrow.

## Shared class catalog (for reuse)

All defined in [`src/app/globals.css`](src/app/globals.css). Mirrored in `Lucas Games-handoff/lucas-games/project/components.css` + `games.css`.

### Layout + utilities
- `.page` — max-width 1280, generous padding. Used on lobby/leaderboard/clans/shop/sign-in.
- `.page-game` — additive class on game pages. Tighter padding + reduced panel/grid/stack-lg gaps + smaller `.game-shell-title`. Phones tighten further inside `@media (max-width: 640px)`.
- `.grid` + `.grid-2 / .grid-3 / .grid-4` — auto-collapsing grids (2-up at ≤900px, 1-up at ≤640px). The 1-up phone collapse is overridden for `.lobby-tile-grid`.
- `.stack / .stack-lg / .row / .row-lg / .center / .between / .wrap` — flex utilities.
- `.text-mute / .text-money / .uppercase` — text utilities.
- `.divider` — dashed rule with centred uppercase label.

### Buttons
- `.btn` (primary gold), `.btn-wood`, `.btn-danger`, `.btn-success`, `.btn-ghost`.
- Sizes: `.btn-sm`, `.btn-lg`, `.btn-block` (width 100%).
- `.lobby-action-btn` — sized to the cash pill inside the profile bar (Free Games + Sign Out).
- `.action-ready` — generic shine + lift for any "claim me" CTA. Used on Daily Spin's SPIN, Monopoly's Roll Dice, anything else that becomes available.

### Surfaces
- `.panel`, `.panel-wood`, `.panel-dark`, `.panel-gold` + `.panel-title`.
- `.sign` — saloon-style framed text (jackpots, totals).

### Inputs / pills / tags
- `.input` (also styles bare `input` + `textarea`), `.label`.
- `.badge` + `.badge-gold / -crimson / -cactus / -sky / -glow`.

### Tiles + lobby
- `.tile / .tile-art / .tile-name / .tile-meta` — game cards.
- `.lobby-tile-grid` — 4-up by default, **stays 3-up on mobile** (overrides `.grid-3 / .grid-4` 1-up rule).

### Profile + header
- `.balance-bar / .avatar / .avatar-sm / .avatar-lg / .avatar-username / .balance` — lobby profile row.
- `.site-header / .site-header-center / .site-nav / .brand / .brand-mark / .brand-name / .brand-tag` — sticky header.
- `.header-presence / .header-presence-label / .header-presence-list / .header-presence-pill / .header-presence-pill.is-me / .header-presence-pill-label / .header-presence-more` — active-players strip.
- `.header-balance / .header-balance-text / .header-balance-name / .header-balance-coins` — game-page profile pill.

### Free games
- `.free-games-btn` + `.free-games-btn.is-ready` + `.free-games-dot` — launcher chip with shimmer + crimson dot when something is ready.
- `.free-games-tile` + `.free-games-tile.is-ready` — modal tile with shine when its cooldown is up.

### Per-game canvases
- `.lg-reel-container` — Slots reels. `max-width: 460px` desktop, `320px` mobile.
- `.crash-grid / .crash-stage / .crash-side / .crash-readout / .crash-canvas` — Crash. On mobile the parent flattens to a column and `.crash-side` is reordered to `order: -1` so the cashout/bet panel sits above the visualization.
- `.dice-readout` — Dice big result number. 64→40 on mobile.
- `.pack-modal / .pack-grid / .pack-card / .pack-card-front / .pack-card-name / .pack-card-desc` — Shop pack-opening modal. On mobile the card height drops to 150px and descriptions hide.

### Other
- `.leaderboard / .leaderboard-row` + `.rank / .player / .game / .winnings` — leaderboard rows.
- `.pinpad / .pin-display / .pin-dot / .pin-shake` — sign-in keypad.

## Animation keyframes (defined globally)

`pinShake`, `chatPulse`, `chatPing`, `chatShake`, `free-games-pulse`, `free-games-shine`, `tile-shine`, `action-ready-pulse`. The chat ping/shake replay on every new message via React keys (`key={pingKey}`) so the keyframes restart from the beginning.

## Themes

`<html data-theme="frontier" | "sunset" | "midnight">` swaps the surface tokens (`--bg`, `--surface`, `--fg`, etc.). Component accents (gold money, crimson danger, cactus success, sky info) keep their hue across themes by referencing the palette tokens directly. Theme is set from the user's equipped cosmetic theme.

## Earn / readiness API

`GET /api/earn/status` is the lightweight readiness probe used by `<FreeGamesButton>` and the modal:

```json
{
  "serverNow": 1714198800000,
  "dailySpin": { "ready": false, "nextAt": 1714200300000, "bonusTokens": 0 },
  "monopoly":  { "ready": true,  "nextAt": null }
}
```

Source: [src/app/api/earn/status/route.ts](src/app/api/earn/status/route.ts).

## Reuse rules of thumb

- **Don't hardcode colours/spacing/shadows** — always go through `var(--token-name)`. Tokens are defined once in `:root` and themed via `[data-theme]` overrides.
- **Don't add new button variants** unless none of `.btn / .btn-wood / .btn-danger / .btn-success / .btn-ghost` (× `.btn-sm / .btn-lg / .btn-block`) fits.
- **Compose, don't extend** — most chrome is layered: `.btn .btn-sm .lobby-action-btn .free-games-btn.is-ready`.
- **Mobile rules belong in the global breakpoints** (`@media (max-width: 640px)` — sometimes also 900px). Add per-component overrides via class names rather than inline media queries.
- **Game pages get `.page-game`** on the `<main>` so the density rules apply.
- **Animations replay via React keys** — to retrigger a CSS animation on a new event (new chat message, new bet, new ready state), increment a key and put it on a wrapping element. Don't try to toggle `animation-name` strings.
- **Realtime in client components only** — `useLive()` requires the `<AppLive>` provider, which is itself a client component. Anything that needs presence/chat/bets must be marked `"use client"`.
- **Free games are special** — the four slugs `daily-spin / monopoly / crossy-road / flappy` get `<FreeGamesButton>` automatically via `<GameShell>`. If you add another free game, update the `FREE_GAMES` set in `GameShell.tsx` and the `FREE_GAMES` list inside `FreeGamesButton.tsx`.
