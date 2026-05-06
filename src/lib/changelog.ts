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
    id: "2026-05-05-changelog-v2",
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
    ],
  },
  {
    id: "2026-04-27-slots-arcade-mobile",
    version: "1.2.0",
    date: "2026-04-27",
    title: "Slots SVG overhaul, Crossy Road + Flappy, mobile polish",
    notes: [
      "Slots: brand-new SVG art, payline trace highlight, 2× speed toggle, jackpot pool that grows with every spin.",
      "Crossy Road and Flappy free arcade games landed alongside Daily Spin and Frontier Monopoly.",
      "Mines: complete UI overhaul with reveal animations. Pickaxe is now disabled in 24-mine mode (it was nonsense there).",
      "Sign-in: player search + 3-column grid on mobile so you can find your account fast.",
      "Mobile: hamburger nav, single-line lobby row, fluid scratch cards, custom volume glyph in the compact header.",
      "New designed game icons replace the old pixel-art tiles in the lobby.",
      "Random gamewide events + unlimited slots autoplay.",
    ],
  },
  {
    id: "2026-04-26-scratch-sfx-shop",
    version: "1.1.0",
    date: "2026-04-26",
    title: "Scratch V2, sound pass, tiered packs",
    notes: [
      "Golden Bounty (scratch-off) V2: tiered tickets, bonus row, particle pops, big-win cue, Quick Draw mode.",
      "Casino sound bus with master volume + mute, plus a fresh sound library across every game.",
      "Mythic rarity in the shop. Tiered packs (Silver Crate, Mythic Vault) with their own pull tables and a showcase overlay for what you opened.",
      "More leaderboard rank tiers and per-design colour tinting on scratch cards so the body text stays legible.",
      "Crash: cleaner cashout flow, multiplier keeps ticking after you cash out, fixed auto-cashout and removed the noisy notify chime.",
      "Roulette layout restructured for both desktop and mobile with a scrolling felt.",
    ],
  },
  {
    id: "2026-04-25-coinflip-blackjack-themes",
    version: "1.0.0",
    date: "2026-04-25",
    title: "Coinflip, Blackjack, Daily Spin, Dice + theme system",
    notes: [
      "Coin Flip + Coin Flip Duel: full UI overhauls with 3D coins, toss arcs, win stamps, and confetti.",
      "Blackjack (single + multiplayer): deal / flip / stamp / confetti animations with a visible deal motion.",
      "Daily Spin: full visual overhaul, proper SVG wheel, jackpot animations.",
      "Dice: casino-style 3D tumbling cube + winner banner.",
      "Poker: card-deal + flip + showdown stamp animations, extended card height so rotated rank doesn't clip.",
      "Cosmetic packs replace direct-buy in the shop — 10k ¢ a pack, pick 1 of 5 reveals.",
      "Clans v2: leader controls, invites, in-clan chat, weekly history, profile drilldowns.",
      "Theme system: Frontier, Sunset, Midnight themes that actually re-skin the game UI, not just the chrome.",
    ],
  },
];
