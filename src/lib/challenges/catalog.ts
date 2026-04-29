// Daily challenge catalog. Each challenge is a template; the daily
// roll picks 3 templates (one of each difficulty) and snapshots the
// goal + reward into the daily_challenges row so live edits to this
// file don't change challenges already in flight.
//
// "Metric" is the canonical event the wallet/game routes record
// against. The catalog binds metric → challenge so adding a new
// challenge usually means adding one row here, no other plumbing.

export type ChallengeDifficulty = "easy" | "medium" | "hard";

export type ChallengeMetric =
  // Generic counters keyed off wallet ledger reasons.
  | { kind: "play_any_game" }                                  // any game-bet debit
  | { kind: "play_specific_game"; game: GameSlug }             // bet debit for a single game
  | { kind: "spend_total_coins" }                              // sum of any game-bet debits
  | { kind: "win_any_game" }                                   // any "*_win" / "*_payout" / "*_settle" credit count
  | { kind: "win_specific_game"; game: GameSlug }              // wins for a single game (credit count)
  // Single-shot triggers — record adds to progress, completes when progress >= 1.
  | { kind: "use_daily_spin" }
  | { kind: "use_monopoly_roll" }
  | { kind: "buy_scratch_ticket" }
  | { kind: "buy_shop_pack" }
  | { kind: "buy_monopoly_pack" }
  // Single-shot threshold for the free arcade games.
  | { kind: "score_threshold"; game: "flappy" | "crossy_road"; score: number };

export type GameSlug =
  | "slots" | "blackjack" | "blackjack_mp" | "roulette" | "mines"
  | "crash" | "plinko" | "dice" | "coinflip" | "coinflip_duel"
  | "scratch" | "poker";

export type ChallengeTemplate = {
  id: string;
  /** Short title for the modal row. Use {goal} to interpolate the rolled goal. */
  title: string;
  /** One-line description of what to do. Use {goal} to interpolate. */
  description: string;
  difficulty: ChallengeDifficulty;
  metric: ChallengeMetric;
  /** Goal range — actual goal is randomly picked at roll time. */
  goalMin: number;
  goalMax: number;
};

/** Difficulty-locked rewards. Easy challenges land on an easy player
 *  early in the day; hard challenges are the chase. */
export const REWARDS_BY_DIFFICULTY: Record<ChallengeDifficulty, { coins: number; points: number }> = {
  easy:   { coins: 5_000,   points: 10  },
  medium: { coins: 25_000,  points: 35  },
  hard:   { coins: 100_000, points: 100 },
};

export const CHALLENGES: ChallengeTemplate[] = [
  // ============ EASY ============
  {
    id: "easy_play_any_5",
    title: "Hit the Floor",
    description: "Play any game {goal} times.",
    difficulty: "easy",
    metric: { kind: "play_any_game" },
    goalMin: 5, goalMax: 8,
  },
  {
    id: "easy_spend_25k",
    title: "Loose Change",
    description: "Wager a total of {goal} ¢ across any games.",
    difficulty: "easy",
    metric: { kind: "spend_total_coins" },
    goalMin: 25_000, goalMax: 50_000,
  },
  {
    id: "easy_win_3",
    title: "Beginner's Luck",
    description: "Win {goal} bets at any game.",
    difficulty: "easy",
    metric: { kind: "win_any_game" },
    goalMin: 3, goalMax: 5,
  },
  {
    id: "easy_daily_spin",
    title: "Spin the Wheel",
    description: "Use your daily spin once.",
    difficulty: "easy",
    metric: { kind: "use_daily_spin" },
    goalMin: 1, goalMax: 1,
  },
  {
    id: "easy_monopoly_roll",
    title: "Roll the Dice",
    description: "Take a Monopoly roll.",
    difficulty: "easy",
    metric: { kind: "use_monopoly_roll" },
    goalMin: 1, goalMax: 1,
  },
  {
    id: "easy_play_slots",
    title: "Pull the Lever",
    description: "Spin Slots {goal} times.",
    difficulty: "easy",
    metric: { kind: "play_specific_game", game: "slots" },
    goalMin: 5, goalMax: 8,
  },
  {
    id: "easy_play_dice",
    title: "Loaded Dice",
    description: "Play Dice {goal} times.",
    difficulty: "easy",
    metric: { kind: "play_specific_game", game: "dice" },
    goalMin: 5, goalMax: 8,
  },
  {
    id: "easy_play_coinflip",
    title: "Heads or Tails",
    description: "Flip a Coin {goal} times.",
    difficulty: "easy",
    metric: { kind: "play_specific_game", game: "coinflip" },
    goalMin: 5, goalMax: 10,
  },

  // ============ MEDIUM ============
  {
    id: "medium_spend_150k",
    title: "Big Spender",
    description: "Wager {goal} ¢ across any games.",
    difficulty: "medium",
    metric: { kind: "spend_total_coins" },
    goalMin: 150_000, goalMax: 250_000,
  },
  {
    id: "medium_win_10",
    title: "On a Run",
    description: "Win {goal} bets at any game.",
    difficulty: "medium",
    metric: { kind: "win_any_game" },
    goalMin: 10, goalMax: 15,
  },
  {
    id: "medium_play_mines",
    title: "Sapper",
    description: "Survive {goal} Mines games (cash out or play to the end).",
    difficulty: "medium",
    metric: { kind: "play_specific_game", game: "mines" },
    goalMin: 8, goalMax: 12,
  },
  {
    id: "medium_play_crash",
    title: "Lift Off",
    description: "Bet on Crash {goal} times.",
    difficulty: "medium",
    metric: { kind: "play_specific_game", game: "crash" },
    goalMin: 8, goalMax: 12,
  },
  {
    id: "medium_play_blackjack",
    title: "Counting Cards",
    description: "Play Blackjack {goal} times.",
    difficulty: "medium",
    metric: { kind: "play_specific_game", game: "blackjack" },
    goalMin: 8, goalMax: 12,
  },
  {
    id: "medium_play_roulette",
    title: "Spin Doctor",
    description: "Place {goal} Roulette spins.",
    difficulty: "medium",
    metric: { kind: "play_specific_game", game: "roulette" },
    goalMin: 5, goalMax: 8,
  },
  {
    id: "medium_buy_scratch",
    title: "Lucky Scratch",
    description: "Buy {goal} scratch tickets.",
    difficulty: "medium",
    metric: { kind: "buy_scratch_ticket" },
    goalMin: 3, goalMax: 5,
  },
  {
    id: "medium_buy_shop_pack",
    title: "Cosmetic Connoisseur",
    description: "Open a shop pack of any tier.",
    difficulty: "medium",
    metric: { kind: "buy_shop_pack" },
    goalMin: 1, goalMax: 1,
  },
  {
    id: "medium_buy_monopoly_pack",
    title: "Land Grab",
    description: "Buy a Monopoly property pack.",
    difficulty: "medium",
    metric: { kind: "buy_monopoly_pack" },
    goalMin: 1, goalMax: 1,
  },

  // ============ HARD ============
  {
    id: "hard_spend_750k",
    title: "Whale",
    description: "Wager {goal} ¢ across any games.",
    difficulty: "hard",
    metric: { kind: "spend_total_coins" },
    goalMin: 750_000, goalMax: 1_500_000,
  },
  {
    id: "hard_win_25",
    title: "Hot Streak",
    description: "Win {goal} bets at any game.",
    difficulty: "hard",
    metric: { kind: "win_any_game" },
    goalMin: 20, goalMax: 30,
  },
  {
    id: "hard_win_slots",
    title: "Boomtown Veteran",
    description: "Win {goal} times at Slots.",
    difficulty: "hard",
    metric: { kind: "win_specific_game", game: "slots" },
    goalMin: 8, goalMax: 12,
  },
  {
    id: "hard_win_blackjack",
    title: "Card Sharp",
    description: "Beat the dealer {goal} times in Blackjack.",
    difficulty: "hard",
    metric: { kind: "win_specific_game", game: "blackjack" },
    goalMin: 8, goalMax: 12,
  },
  {
    id: "hard_play_a_lot",
    title: "Marathon",
    description: "Play any game {goal} times in a single day.",
    difficulty: "hard",
    metric: { kind: "play_any_game" },
    goalMin: 60, goalMax: 100,
  },
  {
    id: "hard_flappy_score",
    title: "Free Bird",
    description: "Reach a score of {goal} in Flappy.",
    difficulty: "hard",
    metric: { kind: "score_threshold", game: "flappy", score: 25 },
    goalMin: 25, goalMax: 25,
  },
  {
    id: "hard_crossy_score",
    title: "Don't Stop",
    description: "Reach a score of {goal} in Crossy Road.",
    difficulty: "hard",
    metric: { kind: "score_threshold", game: "crossy_road", score: 40 },
    goalMin: 40, goalMax: 40,
  },
];

export function findChallenge(id: string): ChallengeTemplate | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/** Render the description with the rolled goal substituted in. */
export function renderDescription(template: string, goal: number): string {
  return template.replace(/\{goal\}/g, goal.toLocaleString());
}
