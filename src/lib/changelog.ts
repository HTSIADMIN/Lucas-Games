// Player-facing changelog. Newest entry first — the WhatsNewModal
// pops the first time it sees an `id` it hasn't shown before, so to
// announce a new release just prepend an entry with a fresh id and
// version number.
//
// Keep notes short and player-friendly: the audience is the people
// playing the games, not engineers reading commits.

export type ChangelogEntry = {
  /** Unique, stable id used as the "seen" key in localStorage. */
  id: string;
  /** Semver-style version string surfaced in the modal header. */
  version: string;
  /** Display date, ISO yyyy-mm-dd so it sorts naturally. */
  date: string;
  title: string;
  /** Bullet lines — rendered as a list. Plain strings, no markdown. */
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-05-13-prestige-tithe-rework",
    version: "1.6.1",
    date: "2026-05-13",
    title: "Penny Pinchers: Prestige Tithe rework",
    notes: [
      "Prestige Tithe is now a permanent multiplier on every Roll It Up, not a one-shot purchase bonus.",
      "Each rank scales the Frugality grant: L1 0.5×, L2 0.6×, L3 0.7×, L4 0.8×, L5 1.0× — applied to your prestige count.",
      "Example: prestige #10 with L5 Tithe drops a full +10 Frugality on the way out. Frugality cap of +50 still applies.",
    ],
  },
  {
    id: "2026-05-05-changelog-v3",
    version: "1.6.0",
    date: "2026-05-05",
    title: "Update notes + a few quality-of-life tweaks",
    notes: [
      "Added these update notes — every release we'll pop a quick summary so you can see what's new without hunting for it. Tap \"Previous updates\" below to scroll back through everything we've shipped.",
      "Out-of-coins pop-up: bust your stack and we'll point you at the free-games hub the first time so you know there's a way back without spending real money.",
      "Free Games tile in the lobby grid for a second, more obvious entry point alongside the header button.",
      "Forgotten browser tabs no longer hammer the server — polling pauses while the tab is hidden, and idle players get auto-logged out after ~25 minutes.",
    ],
  },
  {
    id: "2026-04-30-snake-plinko-v2",
    version: "1.5.0",
    date: "2026-04-30",
    title: "Snake, Plinko V2, new decks + themes",
    notes: [
      "Snake: classic free arcade game with a weekly leaderboard. Eat fruit, earn coins, top the board on Sunday for the 10M ¢ prize.",
      "Plinko V2: real ball physics — gravity, peg collisions, dust bursts, ball trails. Big wins (≥10×) trigger slow-motion and a bucket pulse on monster multipliers.",
      "Five new advanced card decks: Frostbite, Bone, Neon Wire, Burning Embers, Royal Court. Three of them animate.",
      "Five new themes: Emerald, Crimson, Royal, Ice, High Noon. Existing themes got deeper coverage — every panel, button and modal now respects the active theme.",
      "100 billion ¢ max bet across every game and tiered poker tables from 100/200 blinds up to 1M/2M.",
      "Poker: 20-second action timer, current best-hand label, big visual cue when it's your turn, raise slider resets to min each turn.",
      "Mines: pickaxe drop chance now scales with how many safe tiles are left — no more easy 30% pickaxes on 23-mine boards.",
      "Profile setting to mute the bottom-left big-bet toasts.",
    ],
  },
  {
    id: "2026-04-29-welcome-coin-faces",
    version: "1.4.0",
    date: "2026-04-29",
    title: "Welcome modal, coin faces, big-bet toasts",
    notes: [
      "First-time signup modal makes it clear you start with 25,000 ¢.",
      "Live-counting balance pill — your stack tweens up and down instead of just snapping to the new number.",
      "Bottom-left toast pops whenever someone lands a wealth-relative big swing. Win or loss, in green or red.",
      "Coin Face cosmetics in the shop — equip a custom face for Coin Flip and Coin Flip Duel.",
      "Slots: 4× line-pay multipliers, jackpot pool sums the full ledger so it survives cold starts, narrower bet-cap clamp.",
      "Lobby: shiny red POPULAR badge on the slots tile, live active-player chips replacing the old OPEN badges.",
      "Daily-challenges launcher moved off the chat fab so it stops blocking the chat panel.",
      "Blackjack-MP betting + action windows tightened from 15s to 7s.",
    ],
  },
  {
    id: "2026-04-28-clans-challenges-events",
    version: "1.3.0",
    date: "2026-04-28",
    title: "Daily Challenges, Clans v3, Lucky Hour",
    notes: [
      "Daily Challenges: three new objectives every day, paying coins and clan points. Stacks of progress survive the day even if you don't claim immediately.",
      "Clans v3: redesigned modal, member panel showing last-active times and equipped cosmetics, themed UI per active theme.",
      "Lucky Hour: a random hour each day, every game pays a bigger multiplier. Banner across the top tells you when it's live.",
      "Arcade weekly leaderboards on Flappy and Crossy Road — top scorer on Sunday gets 10M ¢.",
      "Smart-pull packs: trade-ins fire whenever you roll a maxed/empty rarity so duplicate-heavy collections still feel fresh.",
      "Inspect any clan from the leaderboard with a single tap.",
    ],
  },
  {
    id: "2026-04-27-slots-arcade-mobile",
    version: "1.2.0",
    date: "2026-04-27",
    title: "Slots SVG overhaul, mobile nav, Mines redesign",
    notes: [
      "Slots: brand-new SVG art, payline trace highlight, 2× speed toggle, jackpot pool that grows with every spin, derived from the wallet ledger so it survives cold starts.",
      "Mines: complete UI overhaul with reveal animations. Pickaxe is now disabled in 24-mine mode (it was nonsense there).",
      "Sign-in: player search + 3-column grid on mobile so you can find your account fast.",
      "Mobile: hamburger nav, single-line lobby row, fluid scratch cards, custom volume glyph in the compact header.",
      "New designed game-icon SVGs replace the old pixel-art tiles in the lobby.",
      "Random gamewide events + unlimited slots autoplay.",
      "Coinflip Duel tile pulses when there's an open challenge waiting for you.",
    ],
  },
  {
    id: "2026-04-27-scratch-sfx-shop",
    version: "1.1.0",
    date: "2026-04-27",
    title: "Golden Bounty, full sound library, mythic packs",
    notes: [
      "Golden Bounty: brand-new western scratch-off lottery game. V2 update the same day added tiered tickets, a bonus row, particle pops, big-win cue and a Quick Draw mode.",
      "Casino sound bus with master volume + mute, plus a fresh sound library across every game (softer plinko, dice toss, chip thuds, pack tear, table-correct sfx everywhere).",
      "Mythic rarity in the shop. Tiered packs (Silver Crate, Mythic Vault) with their own pull tables and a showcase overlay for what you opened.",
      "More leaderboard rank tiers and per-design colour tinting on scratch cards so the body text stays legible.",
      "Crash polish: cleaner cashout flow, multiplier keeps ticking after you cash out, fixed auto-cashout, retired the noisy notify chime.",
    ],
  },
  {
    id: "2026-04-26-layout-free-games-feed",
    version: "1.0.0",
    date: "2026-04-26",
    title: "Free Games modal, lobby grouping, big-odds toasts",
    notes: [
      "Free Games modal: one-stop hub for Daily Spin, Frontier Monopoly, Crossy Road and Flappy with readiness indicators + countdowns and a cross-game switcher.",
      "Lobby grouped by category (Cards / Coins / Dice / House Games) and a 2P+ tag for multiplayer tables.",
      "Big-odds wins now qualify for the live-feed feed alongside big-cash wins.",
      "Bet-input rework: halve/double moved below presets, first preset replaces default.",
      "Header centres the presence rail and surfaces profile + balance even while you're in a game.",
      "Game pages compacted; presence chip shows which game you're in.",
      "Mobile polish across slots, dice, coin flip and monopoly so action buttons stay on-screen.",
    ],
  },
  {
    id: "2026-04-26-cards-clans-cosmetics",
    version: "0.5.0",
    date: "2026-04-26",
    title: "Card animations, Clans v1+v2, cosmetic packs",
    notes: [
      "Blackjack (single + multiplayer): full UI overhaul with deal / flip / stamp / confetti animations.",
      "Poker: card-deal + flip + showdown stamp animations, extended card height so rotated rank doesn't clip.",
      "Daily Spin: full visual overhaul, proper SVG wheel, jackpot animations.",
      "Dice: casino-style 3D tumbling cube + winner banner.",
      "Coin Flip + Coin Flip Duel: 3D coins, toss arcs, win stamps, confetti.",
      "Clans v1: found a clan, join with a code, weekly XP race, chest rewards.",
      "Clans v2 (same day): leader controls, invites, in-clan chat, weekly history, profile drilldowns, chest loot preview.",
      "Cosmetic packs replace direct-buy in the shop — 10k ¢ a pack, pick 1 of 5 reveals.",
      "Theme system: Frontier, Sunset, Midnight themes that actually re-skin the game UI, not just the chrome.",
    ],
  },
  {
    id: "2026-04-25-overhaul-wave",
    version: "0.4.0",
    date: "2026-04-25",
    title: "Roulette, Slots, Flappy overhauls + lobby art",
    notes: [
      "Slots: full Boomtown overhaul — 5×4 hold-and-spin layout tuned to a 96% RTP target.",
      "Roulette: full table overhaul with a CSGO-style horizontal reel strip, then restructured for desktop + mobile with a scrolling felt.",
      "Flappy: full UI overhaul + difficulty modes (Drifter / Gunslinger / Outlaw at 1×/3×/7×).",
      "Crash: history strip + log-scaled curve.",
      "Hand-laid pixel-art SVG icons across all 14 lobby tiles + 128×128 dioramas for the marquee 9.",
      "Avatars now render frame, hat and champion crown everywhere — leaderboard, lobby, sign-in tiles, profile.",
      "Mobile layout pass + leaderboard rows + Crossy Road economy retune.",
    ],
  },
  {
    id: "2026-04-25-monopoly-poker-shop",
    version: "0.3.0",
    date: "2026-04-25",
    title: "Frontier Monopoly, multiplayer Poker, shop expansion",
    notes: [
      "Frontier Monopoly: hourly dice roll on a 36-space ring, 20 western properties across 5 tiers, card-pack store with flip-reveal animation, 13 mystery-card effects, property upgrades to lvl 5.",
      "Multiplayer No-Limit Hold'em: full betting rounds, side pots, 7-card hand evaluator, 6-seat felt with action timer. Sticky right-side action panel + live action log + YOU TO ACT pulse so you never miss your turn.",
      "Shop expansion: hats, gradients, themes, decks, plus the Champion crown for the current top dog.",
      "25k ¢ signup bonus + an XP / level system shown on avatar badges and your profile.",
      "Win banners across every game show bet amount + net profit clearly. XP only awarded on net wins, not wagering.",
      "Plinko fix: real path animation through bigger pegs, multi-ball rapid-drop, optimistic balance, smooth ball interpolation.",
    ],
  },
  {
    id: "2026-04-25-multiplayer-social",
    version: "0.2.0",
    date: "2026-04-25",
    title: "Multiplayer + social layer",
    notes: [
      "Multiplayer Crash: 10s rounds, shared exponential curve, server-validated cashouts.",
      "Multiplayer Blackjack: shared 15s betting window, 15s action timer per seat, server-authoritative dealer plays for everyone.",
      "PvP Coin Flip Duels: challenge / accept / cancel, lobby + history.",
      "Global chat with /tip command, presence rail in the header, big-bets feed across the casino floor.",
      "Profile modal showing per-game stats and a clickable history.",
      "Plinko: ambient ghost chips drop on your board whenever a friend lands a result.",
      "Crossy Road earn-back game with proper AABB collision, edge-aware car wrap, podium leaderboard.",
      "Flappy Bird earn-back with its own leaderboard.",
      "Hand-laid pixel-art icons across slots, mines, chat, reactions, crown, coins — 21 custom icons crisp at any scale.",
    ],
  },
  {
    id: "2026-04-25-launch",
    version: "0.1.0",
    date: "2026-04-25",
    title: "Launch — sign-in, lobby, first 7 games",
    notes: [
      "Sign-in: avatar grid + PIN pad pages.",
      "Lobby with a wallet-balance pill and a leaderboard for top stacks.",
      "Coin Flip, Dice and Slots: first three server-RNG games on the wallet ledger.",
      "Blackjack (server-authoritative state machine) and European Roulette.",
      "Mines (server-state grid) and Plinko (server-picked bucket, animated drop).",
      "Daily Spin (24h cooldown wheel) and Crossy Road (canvas, signed run token).",
      "Crash (single-player): server holds the crash point, client animates the exponential curve, server validates cashouts against its own clock.",
      "Real auth (argon2 + JWT cookie), wallet ledger, full SQL schema, then a Supabase cutover with all 30+ callers updated.",
      "Shop with 10 cosmetics: avatar colours, frames, decks.",
    ],
  },
];
