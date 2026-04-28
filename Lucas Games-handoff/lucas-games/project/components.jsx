/* ============================================================
   LUCAS GAMES — REACT COMPONENT REFERENCE  (live mirror)

   This file documents the production React components in
     src/components/        (shared)
     src/components/social/ (live presence + chat)
     src/app/lobby/         (lobby-specific)
     src/app/games/         (per-game clients)
     src/app/earn/          (free-game clients)

   It is reference, not runnable. Copy patterns rather than
   importing from the handoff bundle. The live source wins on
   any conflict.
   ============================================================ */

// ============================================================
// PAGES — every authed page is wrapped in <AppLive> so the site
// header can read realtime presence via useLive().
//
//   <AppLive me={me} initialChat={initialChat} game="lobby" championId={...}>
//     <SiteHeader current="lobby" centerSlot={<HeaderPresence />} rightSlot={...} />
//     <main className="page">…</main>
//   </AppLive>
//
// On game pages this is wrapped by <GameShell> which also
// renders the FreeGamesButton for the four free games.
// ============================================================

// SITE HEADER — sticky bar with brand, optional center slot,
// nav, and an optional right slot.
//   src/components/SiteHeader.tsx
export function SiteHeader({ current, centerSlot, rightSlot }) {
  return (
    <header className="site-header">
      <a className="brand" href="/">
        <img src="/logo-mark.svg" alt="" className="brand-mark" />
        <div>
          <div className="brand-name">Lucas Games</div>
          <div className="brand-tag">Pixel Saloon</div>
        </div>
      </a>
      <div className="site-header-center">{centerSlot}</div>
      <nav className="site-nav">
        <a href="/lobby" aria-current={current === "lobby" ? "page" : undefined}>Lobby</a>
        <a href="/leaderboard" aria-current={current === "leaderboard" ? "page" : undefined}>Leaderboard</a>
        <a href="/clans" aria-current={current === "clans" ? "page" : undefined}>Clans</a>
        <a href="/shop" aria-current={current === "shop" ? "page" : undefined}>Shop</a>
      </nav>
      {rightSlot}
    </header>
  );
}

// HEADER PRESENCE — "At the Saloon (n)" strip, one pill per
// online player. Reads useLive() — only renders inside <AppLive>.
//   src/components/social/HeaderPresence.tsx
export function HeaderPresence({ currentUserId }) {
  // const { presence, ready, championId } = useLive();
  // if (!ready || presence.length === 0) return null;
  return (
    <div className="header-presence">
      <span className="header-presence-label">★ At the Saloon (n)</span>
      <div className="header-presence-list">
        {/* presence.slice(0, 8).map((m) => (
          <div className={`header-presence-pill${m.userId === currentUserId ? " is-me" : ""}`}>
            <Avatar … size={26} />
            <span className="header-presence-pill-label">{label}</span>
          </div>
        )) */}
      </div>
    </div>
  );
}

// HEADER BALANCE — profile + cash pill rendered in the header
// on game pages so the player's wallet stays visible.
//   src/components/HeaderBalance.tsx
export function HeaderBalance({ initials, avatarColor, username, level, frame, hat, champion, balance }) {
  return (
    <div className="header-balance">
      <Avatar initials={initials} color={avatarColor} size={32} fontSize={13} level={level} frame={frame} hat={hat} champion={champion} />
      <div className="header-balance-text">
        <span className="header-balance-name">{username}</span>
        <span className="header-balance-coins" data-balance>{balance.toLocaleString()} ¢</span>
      </div>
    </div>
  );
}

// AVATAR — initials + level badge + champion crown + cosmetic
// frame + hat. The frame width is auto-capped on small sizes
// (<=28 → 2, <=36 → 3, larger up to 6) so cosmetic frames don't
// swallow the pixel area on header / leaderboard renders.
//   src/components/Avatar.tsx
export function Avatar({ initials, color, size = 48, level, frame, hat, champion, fontSize, className, style }) {
  return (
    <span className={className} style={{ position: "relative", display: "inline-block", width: size, height: size, ...style }}>
      <span className="avatar" style={{ width: size, height: size, background: color }}>
        {initials}
      </span>
      {/* hat / level badge / champion crown render here */}
    </span>
  );
}

// ============================================================
// LOBBY
// ============================================================

// FREE GAMES BUTTON — small chip in the lobby balance row that
// opens a 2x2 modal with Daily Spin / Monopoly / Crossy Road /
// Flappy. Polls /api/earn/status every 30s and shimmers gold
// when any free game is ready. Tiles inside the modal show
// either a live countdown ("23m 04s") or a green READY badge.
//
// Pass `compact` when embedding inside <GameShell> so the chip
// drops to .btn-sm size.
//   src/app/lobby/FreeGamesButton.tsx
//   /api/earn/status returns:
//     { dailySpin: { ready, nextAt, bonusTokens },
//       monopoly:  { ready, nextAt },
//       serverNow }
export function FreeGamesButton({ compact = false }) {
  // const [open, setOpen] = useState(false);
  // const [status, setStatus] = useState(null);
  // useEffect: poll /api/earn/status every 30s.
  // useEffect: tick every 1s while modal is open so the
  //            countdown updates.
  return (
    <>
      <button
        type="button"
        className={`btn lobby-action-btn free-games-btn${/* anyReady */ " is-ready"}${compact ? " btn-sm" : ""}`}
      >
        Free Games
        {/* anyReady && */ <span aria-hidden className="free-games-dot" />}
      </button>
      {/* modal: panel-wood with 2x2 grid of <a className="tile free-games-tile is-ready?"> */}
    </>
  );
}

// SIGN OUT BUTTON — sits next to FreeGamesButton in the lobby.
//   src/app/lobby/SignOutButton.tsx
export function SignOutButton() {
  return <button className="btn btn-ghost lobby-action-btn">Sign out</button>;
}

// LOBBY GAME TILE — a card link in the .lobby-tile-grid.
// Add a sky 2P+ badge for multiplayer tables.
export function GameTile({ slug, name, icon, live, multiplayer }) {
  return (
    <a className="tile" href={live ? `/games/${slug}` : "#"} aria-disabled={!live || undefined}>
      <div className="tile-art">{/* <GameIcon name={icon} size={140} /> */}</div>
      <div className="tile-name">{name}</div>
      <div className="tile-meta">
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <span className={`badge ${live ? "badge-cactus" : ""}`}>{live ? "OPEN" : "SOON"}</span>
          {multiplayer && <span className="badge badge-sky">2P+</span>}
        </span>
        <span>Play →</span>
      </div>
    </a>
  );
}

// ============================================================
// SHARED INPUTS
// ============================================================

// BET INPUT — coins amount pill + +100 / +1k / +10k / +100k /
// MAX preset row + ÷2 / ×2 row. The first preset press from a
// fresh control replaces the default 100 stake (+1k → 1,000),
// and stacks afterwards. Tracked via a touchedRef that resets
// on Clear.
//   src/components/BetInput.tsx
export function BetInput({ value, onChange, max, disabled }) {
  // setSafe(n) clamps to [0, max] and floors.
  // addPreset(delta): if !touched && value === 100 → setSafe(delta);
  //                   else setSafe(value + delta).
  // halve, double, clear all reset/touch as appropriate.
  return (
    <div className="stack" style={{ gap: "var(--sp-3)" }}>
      <div className="between" style={{ alignItems: "baseline" }}>
        <label className="label">Bet (Coins)</label>
        <button className="btn btn-ghost btn-sm">Clear</button>
      </div>
      <div /* COINS amount pill, fontSize var(--fs-h3) */ />
      <div className="row" style={{ flexWrap: "wrap", justifyContent: "center" }}>
        {/* +100, +1k, +10k, +100k, MAX */}
      </div>
      <div className="row" style={{ gap: "var(--sp-2)" }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}>÷2</button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}>×2</button>
      </div>
    </div>
  );
}

// ============================================================
// LIVE / SOCIAL
// ============================================================

// APP LIVE — single client wrapper used by every authed page.
// Mounts realtime presence, big-bets feed, chat history, and
// the floating ChatDrawer.
//   src/components/social/AppLive.tsx
//   <AppLive me={me} initialChat={initialChat} game="lobby" championId={...}>
//     <SiteHeader … />
//     <main>…</main>
//   </AppLive>

// CHAT DRAWER — floating launcher bottom-right. Pulses + pings
// + shakes when a new message arrives from someone else and the
// chat tab isn't already open. Has a "Big Bets & Odds" tab that
// surfaces wins paying ≥50× (big odds) regardless of bet size.
//   src/components/social/ChatDrawer.tsx
//   keyframes: chatPulse, chatPing, chatShake (in games.css)

// LIVE PROVIDER — supabase channels + 3-second chat polling +
// 4-second big-bets polling. Provides {presence, bets, chat,
// championId, ready, pushChat} via useLive().
//   src/components/social/LiveProvider.tsx
//   LiveBet shape: { id, userId, username, avatarColor, initials,
//                    frame, hat, game, bet, payout, net,
//                    multiplier, bigOdds, at }
//   Big-bet thresholds: |net| >= 50_000 OR multiplier >= 50.

// ============================================================
// GAME SHELL — used by every game page (incl. four free games).
//   src/components/GameShell.tsx
// Renders: <AppLive>
//            <SiteHeader centerSlot={<HeaderPresence />}
//                        rightSlot={<HeaderBalance ... />} />
//            <main className="page page-game">
//              row: ← Lobby, FreeGamesButton (if free game),
//                   <h1 className="game-shell-title">,
//                   <span className="game-shell-blurb">
//              <DeckProvider palette={…}>{children}</DeckProvider>
//            </main>
//          </AppLive>
//
// FREE_GAMES = {"daily-spin", "monopoly", "crossy-road", "flappy"}
// ============================================================
