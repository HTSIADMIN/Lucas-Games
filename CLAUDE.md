@AGENTS.md

# Lucas Games — project notes

A pixel-saloon casino + free-games hub. Next.js 16 App Router (server components by default, client islands where needed) on Supabase Postgres + Realtime, deployed to Vercel. The art style is "cozy pixel tavern × western × PS1-era pixel art" — bitmap M6X11 type, chunky outlines, hard drop shadows, no blur, no rounded corners except poker chips.

The handoff bundle under `Lucas Games-handoff/lucas-games/project/` is a living mirror of the live app (refreshed alongside this file). The live source still wins on any conflict — when those two disagree, trust `src/`.

## Architecture at a glance

- **Pages** — `src/app/<route>/page.tsx`. Authed pages call `readSession()`, fetch what they need server-side, and render inside `<AppLive>` so the site header has access to live presence.
- **Layout chrome** — every authed page renders:
  ```
  <AppLive me={me} initialBalance={balance} initialChat={initialChat} game="…" championId={…}>
    <SiteHeader current="…" centerSlot={<HeaderPresence />} rightSlot={…} />
    <main className="page">…</main>
  </AppLive>
  ```
  Game pages wrap that in [`GameShell`](src/components/GameShell.tsx), which renders a compact header (no right-side profile pill) and adds a `<FreeGamesButton compact />` next to ← Lobby on the six free games.
- **Realtime** — `src/components/social/LiveProvider.tsx` runs three Supabase channels (presence, postgres_changes on chat + game_sessions). The HTTP polling fallback for chat + bets now rides on `/api/app/snapshot` (see "Snapshot packet optimizer" below) so there's no separate `/api/social/live` route.
- **Server APIs** — `src/app/api/<area>/<endpoint>/route.ts`. Conventions: `runtime = "nodejs"`, `readSession()` first, return `{ error: "…" }` with the right status on failure.
- **Game engines** — `src/lib/games/<game>/engine.ts` are pure functions (no side effects). Routes call them, persist via `src/lib/db`, and credit/debit via `src/lib/wallet`.

Top-level layout:

| Path | What lives there |
|------|------------------|
| `src/app/games/` | Bet-against-house games: blackjack (+ blackjack-mp), coinflip (+ coinflip-duel), crash, dice, mines, plinko, poker, roulette, scratch, slots |
| `src/app/earn/` | Free-to-play earn games: daily-spin, monopoly, crossy-road, flappy, snake, penny-pinchers |
| `src/app/lobby/` | Lobby + Free Games modal |
| `src/app/clans/` `src/app/leaderboard/` `src/app/shop/` `src/app/sign-in/` | Standard hub pages |
| `src/lib/games/<game>/` | Pure engines (catalog + engine + helpers) — `freeGames.ts` is the registry of earn slugs |
| `src/lib/db/` | Supabase client + every persistence helper (re-exported from `index.ts`) |
| `src/lib/wallet/` | `credit() / debit() / getBalance()` — only path that mutates wallet ¢ |
| `src/lib/auth/` | `readSession() / signSession() / verifySession()` (JWT in cookie) |
| `src/lib/sfx/` | Module-level audio bus — `play(name)` is all you usually need |
| `src/lib/feed/` | `BIG_BET_THRESHOLD`, `qualifyBet()` — single source for "is this bet feed-worthy" |
| `src/lib/events/` | `getActiveEvent()` — Lucky Hour-style rolling globals |
| `src/lib/clans/` `src/lib/challenges/` `src/lib/arcade/` | Subsystem modules |
| `supabase/migrations/` | `0001_…` through `0039_…` — append-only, never edit landed migrations |

## Snapshot packet optimizer

`/api/app/snapshot` ([src/app/api/app/snapshot/route.ts](src/app/api/app/snapshot/route.ts)) is the **single per-user poll** that replaced five separate ones:

| Used to be | Now folded into |
|------------|-----------------|
| `/api/wallet/balance`   | `snapshot.balance` |
| `/api/events/active`    | `snapshot.event` |
| `/api/earn/status`      | `snapshot.earn` (still exists for `<FreeGamesButton>` standalone cases) |
| `/api/challenges/state` | `snapshot.dailyClaimable` (count only) |
| `/api/social/live`      | `snapshot.chat` + `snapshot.bets` (route deleted) |

[`AppSnapshotProvider`](src/components/AppSnapshotProvider.tsx) polls every 10s via `useVisibleInterval` (paused on hidden tabs), refires on `visibilitychange`, and exposes `useAppSnapshot()` to header fixtures, the event ticker, FreeGamesButton, the DailyChallenges launcher badge, and `LiveProvider`. Realtime channels still push instantly; the snapshot only carries the HTTP fallback. Game clients can call `refresh()` to force an immediate re-fetch after a wallet-affecting action, or dispatch the legacy `lg:balance` window event to update the cached balance without a fetch.

## Penny Pinchers — local-first architecture (May 2026)

The clicker used to round-trip every click + spend to the server, batched through `recordClicks.ts`. That architecture is gone. Penny Pinchers is now **client-authoritative** — the browser owns the entire simulation, the server is dumb persistence + the wallet bridge.

### How it works

- The full game state is a single `PennyPinchersGameState` blob defined in [`engine.ts`](src/lib/games/penny-pinchers/engine.ts). Every action (click, buy upgrade, hire helper, prestige, etc.) is a pure mutation function (`applyClick`, `applyBuyUpgrade`, …) that takes a state and returns a new state. The client wires these into the React state machine; **zero network round-trips on play**.
- Persistence: only **four** server routes remain.

| Route | Purpose |
|-------|---------|
| `GET /api/earn/penny-pinchers/load` | Returns the player's `state_blob`. On first read per user, seeds the blob from the legacy normalized rows (`penny_pinchers_state / _upgrades / _helpers / _perm_upgrades / _achievements`) so existing players keep their progress. |
| `POST /api/earn/penny-pinchers/save` | Accepts the full state blob and writes it. No validation beyond shape — local-first means trusted client. |
| `POST /api/earn/penny-pinchers/bank` | The only server-authoritative action. Accepts the state blob, runs `applyBank` server-side, credits the wallet ledger atomically with the save, returns new state + new wallet balance. |
| `GET /api/earn/penny-pinchers/leaderboard` | Read-only top-10. Polled separately on a slow cadence (30s). |

The legacy `/click /upgrade /hire /perm-upgrade /blessing /cushion /relic-chest /prestige /state /wallet` routes and `recordClicks.ts` were all deleted. So was the click batcher (`FLUSH_INTERVAL_MS`, `drainClickQueue`, etc.) — every action is a synchronous local state mutation now.

### Save loop

[PennyPinchersClient.tsx](src/app/earn/penny-pinchers/PennyPinchersClient.tsx) owns the simulation:

- **Save every 10 seconds** if the state is dirty (via `useVisibleInterval` so hidden tabs don't hammer the server). A `SaveChip` component in the right-column stack shows the countdown ("Saves in 7s") with a brief "Saved" pulse on success and "Save failed — retrying" if a save fails.
- **Forced save** on every bank (server-authoritative) and on tab-hide / `beforeunload` via `navigator.sendBeacon` so closing the laptop never loses progress.
- **localStorage mirror** (`pp:state:v1`) on every save attempt. On next mount, whichever of (server blob, local mirror) was saved more recently wins — phone → laptop → tablet stay in sync automatically.
- **Offline accrual** is now client-side: `applyOfflineAccrual` runs on load, credits the helper PC earned during the gap (capped by `offlineCapHours`), and pops the welcome-back banner if the gap was ≥ 60s.

### Schema

Migration `0040_penny_pinchers_state_blob` added `state_blob jsonb` + `last_saved_at timestamptz` to `penny_pinchers_state`. The legacy normalized tables stay populated by historical data — they're read once per user (by `/load`) to seed the blob, then go cold. Don't write to them in new code.

### Security model

Per the project's stated scope (private play among friends), there is **no anti-cheat** on the save path. If a tampered client sends `cents: 10_000_000_000`, the server happily saves it and the next `/bank` credits the wallet accordingly. If that ever needs to change, add validation in [bank/route.ts](src/app/api/earn/penny-pinchers/bank/route.ts) — it's the only chokepoint that matters because it's the sole route that touches the wallet ledger.

## Recent UI overhauls (April–May 2026)

Things a future session needs to know about. Items earlier in the list landed first; the most recent work is at the end.

- **Header refactor** — `<AppLive>` wraps the entire authed shell (header + main). Active-players strip is centred in the site header via `<HeaderPresence>`; on game pages a `<HeaderBalance>` pill replaces in-page balance-bar. Lobby still uses an in-page balance-bar beside Free Games + Sign Out.
- **Free Games modal + readiness** — `<FreeGamesButton>` shimmers gold when any free game is ready. Modal shows live countdowns ("23m 04s") on Daily Spin / Monopoly tiles or a green READY badge when their cooldown is up. Crossy/Flappy/Snake/Penny Pinchers stay as static FREE / BANK ON IT.
- **Big Bets & Odds** — `LiveBet` carries `multiplier` + `bigOdds`. The feed surfaces wins paying ≥50× the wager regardless of bet size. `BetLine` shows a glowing gold `100×` badge on those wins.
- **Chat-button attention** — new chat from someone else fires a one-shot shake + sonar ping (gold + crimson) on top of the pulse + tab-title flash + unread badge. Driven by a `pingKey` ref + state.
- **Lobby grid** — single `.grid .grid-4 .lobby-tile-grid`. Tiles arranged in category order (cards → coins → dice → other). Multiplayer tables show a sky-blue `2P+` badge.
- **Density** — `.page-game` adds tighter padding/gaps. Slots reels capped at 460px (320px mobile), Crash readout 88→56 + canvas height 140 + `.crash-side` reordered above `.crash-stage` on phones, Dice readout 64→40 on phones, Coin Flip coin 240→180.
- **BetInput** — first preset press from a fresh control replaces the default 100 stake (`+1k → 1,000`, not 1,100); stacks afterwards. ÷2 and ×2 in a row below presets. COINS amount font is `fs-h3`. `MAX_BET` is now 10 T (was 100 B) so an 8-figure stake doesn't get clamped on the high end.
- **Header profile pill** — replaces the desktop "Profile" button. `.nav-profile-pill` shows avatar + name + level + balance and links to `/profile`. Sized to the navbar height (different rules from the lobby's larger `.balance-bar`).
- **Mobile nav menu** — under the breakpoint, desktop nav + sfx + What's New collapse into a hamburger. Lives in [`MobileNavMenu.tsx`](src/components/MobileNavMenu.tsx).
- **What's New modal** — first time a player sees a new entry id from [`src/lib/changelog.ts`](src/lib/changelog.ts), `<WhatsNewModal>` pops with the latest patch notes; older notes hide behind a "Previous updates" toggle. The header [`<WhatsNewButton>`](src/components/WhatsNewButton.tsx) re-opens it on demand, with a crimson dot until the player has acknowledged the latest entry. Adding a new entry to `CHANGELOG[0]` is the only trigger needed.
- **Idle timeout** — [`<IdleTimeout>`](src/components/IdleTimeout.tsx) tracks `keydown / touchstart / click` (NOT `mousemove` — too noisy) and pops a "Still there?" warning at 10 min idle, auto-logs out 5 min later. Mounted on every authed page in the root layout. Pairs with the `last_active_at` column on `user_sessions` (migration `0033`) so server-side stale-session sweeps can also revoke.
- **Broke modal** — [`<BrokeModal>`](src/components/BrokeModal.tsx) detects a wallet-zero state once and points the player at the Free Games hub so they know there's a way back without spending real money.
- **SFX bus + controls** — [`src/lib/sfx`](src/lib/sfx) is module-level: `play("coin.drop")` from any client component, no provider. mute + master volume in localStorage, [`<SfxControls>`](src/components/SfxControls.tsx) in the desktop header (and the mobile menu).
- **Daily Spin** — case-opening horizontal ticker replaced the SVG wheel.
- **Blackjack MP / solo** — felt rim, big cards, action buttons, payoff burst. The MP redesign was ported back to the solo table.
- **Open Graph card** — [`src/app/opengraph-image.tsx`](src/app/opengraph-image.tsx) renders a 1200×630 saloon-themed card with no external font fetch (Discord scrape was timing out on the Google Fonts pull). To swap in a designed banner, drop a 1200×630 image at `src/app/opengraph-image.png` and Next.js auto-uses it.

## Penny Pinchers — game-specific notes

[/earn/penny-pinchers](src/app/earn/penny-pinchers) is the largest single feature in the repo. Its catalog/engine ([`src/lib/games/penny-pinchers/`](src/lib/games/penny-pinchers/)) is ~1,800 LOC and the client is ~2,500 LOC. High-level systems:

- **Clicker loop** — coins spawn in a play area, click banks PC. 6 denominations, progressive unlocks via spawn-unlock upgrades. Auto-Picker, Two-Finger Pickup, Pile It Up auto-merge. Pinch Streak combo (5/15/30 clicks → Warm/Hot/Money Frenzy multipliers + spawn shower).
- **Multi-trait coins** — 9 traits (`shiny / sticky / bent / foreign / ancient / cursed / lightning / frosted / lucky`) live in `TRAITS`/`TRAIT_COLOR` in catalog.ts. Multiple traits stack on one coin via independent rolls or via Pile It Up fusion. `traitMultiplier(traits[])` compounds them.
- **Album** — 6 pages (one per non-stack trait), filling slots grants per-trait spawn-chance bonuses + completion bonuses. Survives Prestige.
- **Events** — Coin Storm, Money Frenzy, Rainy Day, Lost Wallet (return → +1 Frugality, keep → -1 + PC), Wishing Fountain, Couch Cushion Dive (mini slot pull).
- **Frugality** — −50 to +50, +0.5% PC per positive point. Earned from Lost Wallet returns / cushion lint pulls / Prestige Tithe.
- **Relic shop** — 9 relics across common→legendary, leveled (max 3-5). Bought via Frugality at the chest. Half-refund on max-dup.
- **Prestige (Roll Up)** — wipes session state (cents + helpers + run upgrades), awards Bank Tokens on a sqrt curve (`tokens = floor(sqrt(currentCents / 4_000))`). Threshold ramps with prestige count: +100k per rank for the first 10 prestiges, +200k through 20, +300k through 30, etc. Each prestige adds a permanent PC multiplier on every coin (first +300%, then +100% per rank).
- **Permanent upgrades** — 8 perms (Bigger Pockets, Practice Eyes, Vending Lifer, Old Hand, Lucky Streak, Generous Helpers, Higher Ceilings, Prestige Tithe) bought with Bank Tokens. Survive Prestige.
- **Achievements** — 14 humorous targets driving milestone toasts.

When extending: add to the relevant catalog table, then teach the engine + UI. Server-side cents math always lives in `engine.ts` so the server-validated path matches what the client tweens.

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
- `.tile.tile-alert / .tile-alert-dot` — gold/crimson pulsing border + dot when a tile has something the player should claim.
- `.tile-popular-badge / .tile-popular-shine / .tile-popular-text` — flame badge for hot tables.
- `.lobby-tile-grid` — 4-up by default, **stays 3-up on mobile** (overrides `.grid-3 / .grid-4` 1-up rule).

### Header + nav
- `.site-header / .site-header-center / .site-header-desktop / .site-header-compact / .site-nav / .brand / .brand-mark / .brand-name / .brand-tag` — sticky header (compact variant for game pages).
- `.header-presence / .header-presence-label / .header-presence-list / .header-presence-pill / .header-presence-pill.is-me / .header-presence-pill.is-link / .header-presence-pill-label / .header-presence-more` — active-players strip.
- `.header-balance / .header-balance-text / .header-balance-name / .header-balance-coins` — game-page profile pill.
- `.nav-profile-pill / .nav-profile-text / .nav-profile-uname / .nav-profile-lvl / .nav-profile-balance` — desktop nav avatar + name + level + balance pill (links to /profile).
- `.sfx-controls / .sfx-mute / .sfx-slider` — header SFX controls.
- `.mobile-nav / .mobile-nav-trigger / .mobile-nav-trigger-bar / .mobile-nav-backdrop / .mobile-nav-panel / .mobile-nav-link / .mobile-nav-divider / .mobile-nav-row / .mobile-nav-label` — hamburger menu under the breakpoint.

### Profile (lobby)
- `.balance-bar / .avatar / .avatar-sm / .avatar-lg / .avatar-username / .balance` — lobby profile row.

### Free games
- `.free-games-btn` + `.free-games-btn.is-ready` + `.free-games-dot` — launcher chip with shimmer + crimson dot when something is ready.
- `.free-games-tile` + `.free-games-tile.is-ready` — modal tile with shine when its cooldown is up.

### Per-game canvases
- `.lg-reel-container` — Slots reels. `max-width: 460px` desktop, `320px` mobile.
- `.crash-grid / .crash-stage / .crash-side / .crash-readout / .crash-canvas` — Crash. On mobile the parent flattens to a column and `.crash-side` is reordered to `order: -1` so the cashout/bet panel sits above the visualization.
- `.dice-readout` — Dice big result number. 64→40 on mobile.
- `.pack-modal / .pack-grid / .pack-card / .pack-card-front / .pack-card-name / .pack-card-desc` — Shop pack-opening modal. On mobile the card height drops to 150px and descriptions hide.
- `.pp-shop-scroll` — custom scrollbar for the Penny Pinchers shop tabs (gold thumb on saddle track).
- `.slots-cash-coin / .slots-cash-coin-shine / .slots-cash-coin-glint` — slot reel cash-coin sprite with shine sweeps.
- `.plinko-bucket-pulse / .plinko-bucket-pulse-huge` — bucket impact pulse for ordinary vs jackpot wins.
- `.scratch-flame / .scratch-foil` — scratch ticket flame + foil texture.
- `.pixel-coin` — draggable pixel coin sprite shared across earn games.

### Leaderboard
- `.leaderboard / .leaderboard-row` + `.rank / .player / .game / .winnings`.

### Sign-in
- `.pinpad / .pin-display / .pin-dot / .pin-shake` — sign-in keypad.

### Cosmetic FX
- `.lg-anim-avatar-prismatic / .lg-anim-frame-solar / .lg-anim-frame-aether / .lg-anim-hat-crown / .lg-crown-jewel-a/b/c` — equipped-cosmetic animations on avatars / frames / hats.
- `.lg-deck-anim-neon-wire / .lg-deck-anim-embers / .lg-deck-anim-royal-court` — animated card-back palettes.
- `.rarity-mythic` — mythic rarity outline glow.

## Animation keyframes (defined globally)

Top of file: `pinShake`, `chatPulse`, `chatPing`, `chatShake`, `free-games-pulse`, `free-games-shine`, `tile-shine`, `action-ready-pulse`, `tile-alert-pulse`, `tile-alert-dot-pulse`, `daily-fresh-pulse`, `tile-popular-shine`, `tile-popular-pulse`, `tile-presence-pulse`. The chat ping/shake replay on every new message via React keys (`key={pingKey}`) so the keyframes restart from the beginning.

Game-specific (lower in the file): `slots-coin-shine / -pulse / -spin-glow`, `lg-payline-trace / -pulse`, `lg-jackpot-glow`, `mines-flip-in / -out / -gem-pulse / -bomb-shake / -bomb-flash / -pickaxe-sweep / -board-bust / -multi-pop / -sparkle`, `scratch-foil-shimmer / -flame-flicker / -shake / -cell-pulse / -cell-near / -cell-pop / -bigwin-shake / -poster-slam / -stamp-slam / -inkblot / -payout-rise`, `pixel-coin-idle / -drag`, `lg-prismatic / -solar / -aether / -crown-pulse / -crown-jewel-a/b/c / -deck-neon-scroll / -deck-neon-glow / -deck-embers-flicker / -deck-royal-spin / -deck-royal-halo / -vault-shimmer`, `big-event-toast-life`, `game-event-slide / -pulse / -icon`, `plinko-bucket-pulse`.

## Themes

`<html data-theme="…">` swaps the surface tokens. Component accents (gold money, crimson danger, cactus success, sky info) keep their hue across themes by referencing the palette tokens directly. Theme is set from the user's equipped cosmetic theme.

Available themes — `frontier`, `sunset`, `midnight`, `emerald`, `royal`, `crimson`, `ice`, `highnoon`. Default (no `data-theme` set or `data-theme="saloon"`) is the parchment+saddle base palette. Per-theme overrides extend across `.panel / .panel-title / .text-mute / .label / .divider / .balance-bar / .input / .leaderboard*-row* / .site-header / .site-nav / .mobile-nav-* / .header-balance / .sfx-controls / .tile / .tile-art / .tile-name / .clan-detail-modal / .clan-row` so a theme covers the whole app rather than just the page chrome.

## Design tokens (full inventory)

Live source is [`src/app/globals.css`](src/app/globals.css). The handoff mirror is [`tokens.css`](Lucas%20Games-handoff/lucas-games/project/tokens.css).

### Palette (`:root`)
- `--saddle-50/100/200/300/400/500/600` — wood ramp
- `--parchment-50/100/200/300` — paper
- `--gold-100/300/500/700`, `--crimson-…`, `--cactus-…`, `--sky-…` — accent ramps (4 stops each)
- `--ink-1000/900/800` — outlines
- `--neon-gold / -crimson / -cactus / -sky` — saturated outline glows
- `--suit-spades/clubs/hearts/diamonds`

### Semantic surfaces
- `--bg`, `--bg-deep`, `--bg-lift` — page bg ramp
- `--surface`, `--surface-edge`, `--surface-panel` — generic surfaces
- `--surface-highlight` — subtle "highlighted" bg for affordable cards / Bank-It-ready / your-row / helper PC/sec chip. Per-theme tuned: light themes lean warmer, dark themes lean toward gold-tinted brown so a highlight reads as "lifted" rather than glaring cream
- `--chip-shadow` — drop shadow under chip-shaped UI (roulette bet chips, etc). Per-theme: lighter on light themes, darker on dark themes so chips read as raised against their bg
- `--fg / -muted / -dim / -on-wood / -on-dark`, `--stroke / -soft`
- `--success / -warn / -danger / -info`, `--money / -shadow`

### Type
- `--font-display / -body / -mono` (all M6X11 → VT323 fallback → ui-monospace)
- `--fs-display / -h1 / -h2 / -h3 / -h4 / -body-lg / -body / -small / -tiny`
- `--lh-tight / -snug / -body`
- `--ls-tight / -loose / -display`

### Spacing + chrome
- `--sp-0…9` (2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96)
- `--r-0 / -card / -chip / -button` — radius (chip is 999px, everything else 0)
- `--bw-thin / -card / -button / -panel / -chunky` — border widths (2 / 3 / 3 / 4 / 6)

### Shadows + bevels
- `--sh-card-rest / -hover / -press`, `--sh-button-rest / -press`, `--sh-popover`, `--sh-table` — hard pixel drops
- `--bevel-light / -dark / -wood` — inset top highlight + bottom shadow
- `--glow-gold / -crimson / -cactus / -sky` — neon outline + soft halo

### Motion
- `--ease-snap / -out / -in`, `--dur-quick / -snap / -flop`

## Earn / readiness API

`GET /api/earn/status` is the lightweight readiness probe used by `<FreeGamesButton>` standalone. The combined `/api/app/snapshot` exposes the same shape under `snapshot.earn`:

```json
{
  "serverNow": 1714198800000,
  "dailySpin": { "ready": false, "nextAt": 1714200300000, "bonusTokens": 0 },
  "monopoly":  { "ready": true,  "nextAt": null }
}
```

Source: [src/app/api/earn/status/route.ts](src/app/api/earn/status/route.ts), [src/app/api/app/snapshot/route.ts](src/app/api/app/snapshot/route.ts).

## Shared helpers — reach for these first

- [`src/lib/games/freeGames.ts`](src/lib/games/freeGames.ts) — `FREE_GAMES` list, `FreeGameSlug` type, `isFreeGame(slug)` predicate. Used by `GameShell` (decide whether to render the cross-game switcher) and `FreeGamesButton` (modal grid). Add new free games here only.
- [`src/lib/feed/thresholds.ts`](src/lib/feed/thresholds.ts) — `BIG_BET_THRESHOLD`, `BIG_ODDS_MULTIPLIER`, `FEED_WINDOW_MS`, `MAX_FEED_ROWS`, plus `qualifyBet({ bet, payout, wealth })`. Used by both the realtime channel filter (`LiveProvider`) and the snapshot endpoint; they always agree.
- [`src/components/ModalShell.tsx`](src/components/ModalShell.tsx) — `<ModalShell open onClose width={...}>` covers the backdrop + centered card + Esc-to-close + click-outside + body-scroll-lock pattern that was previously hand-rolled in five places. `<ModalCloseButton onClose={...} />` is the matching saddle × button. Reach for these instead of writing another `position: "fixed", inset: 0, ...` div.
- [`src/lib/hooks/useVisibleInterval.ts`](src/lib/hooks/useVisibleInterval.ts) — drop-in replacement for `setInterval` that pauses on hidden tabs and re-fires on visibility return. Use for *every* periodic fetch.
- [`src/lib/sfx/index.ts`](src/lib/sfx/index.ts) — module-level SFX bus. `play("coin.drop")` from any client component. `subscribe(fn)` lets controls UI re-render on mute/volume change. Don't write a new audio element; add a name in `registry.ts` and call `play()`.
- [`src/components/AppSnapshotProvider.tsx`](src/components/AppSnapshotProvider.tsx) — `useAppSnapshot()` exposes `{ snapshot, refresh, setBalance }`. Refresh after wallet-affecting actions. The legacy `lg:balance` window event still works for non-context listeners.
- [`src/components/AnimatedBalance.tsx`](src/components/AnimatedBalance.tsx) — count-up tween for any numeric balance (header, lobby, in-game).
- [`src/components/GameIcon.tsx`](src/components/GameIcon.tsx) — `<GameIcon name="lobby.daily_spin" />` resolves a registered icon name into the right SVG. Edit `GAME_ICONS` to add a new one.
- [`src/lib/changelog.ts`](src/lib/changelog.ts) — prepend a `ChangelogEntry` to surface a new What's New popup; the modal stamps the latest `id` on dismiss.

## Reuse rules of thumb

- **Don't hardcode colours/spacing/shadows** — always go through `var(--token-name)`. Tokens are defined once in `:root` and themed via `[data-theme]` overrides.
- **Don't add new button variants** unless none of `.btn / .btn-wood / .btn-danger / .btn-success / .btn-ghost` (× `.btn-sm / .btn-lg / .btn-block`) fits.
- **Compose, don't extend** — most chrome is layered: `.btn .btn-sm .lobby-action-btn .free-games-btn.is-ready`.
- **Mobile rules belong in the global breakpoints** (`@media (max-width: 640px)` — sometimes also 900px). Add per-component overrides via class names rather than inline media queries.
- **Game pages get `.page-game`** on the `<main>` so the density rules apply.
- **Animations replay via React keys** — to retrigger a CSS animation on a new event (new chat message, new bet, new ready state), increment a key and put it on a wrapping element. Don't try to toggle `animation-name` strings.
- **Realtime in client components only** — `useLive()` requires the `<AppLive>` provider, which is itself a client component. Anything that needs presence/chat/bets must be marked `"use client"`.
- **One poll per concern** — if you need `balance / event / earn / dailyClaimable / chat / bets`, consume `useAppSnapshot()` instead of fetching directly. Never add a new global poll without checking whether it can fold into the snapshot.
- **All fetches that loop go through `useVisibleInterval`** — bare `setInterval` keeps hammering hidden tabs. Use the hook so polling pauses cleanly.
- **Free games are special** — the six slugs in `FREE_GAMES` get `<FreeGamesButton>` automatically via `<GameShell>`. To add another, add it to `FREE_GAMES` and (if it has a cooldown) extend `/api/earn/status` + the snapshot endpoint.
- **Penny Pinchers is local-first** — every gameplay action is a pure mutation function in [`engine.ts`](src/lib/games/penny-pinchers/engine.ts) (`applyClick`, `applyBuyUpgrade`, …). The client wires them via `mutate(applyXxx)` for instant updates; the autosave loop persists. Don't add new server routes for in-game actions — extend the engine and let the next `/save` carry it through. Only `bank` touches the wallet ledger.
