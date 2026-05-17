// Per-game achievement detection. Each function is pure: given the
// just-settled game's outcome context, return the list of
// achievement ids that the player has potentially earned. The DB
// helper (unlockAchievements in src/lib/achievements/db.ts) dedupes
// against the already-unlocked rows so re-triggering is harmless.
//
// Routes call: const ids = detectFooAchievements(ctx);
//              const newly = await unlockAchievements(userId, "foo", ids);
//              // newly = ids that actually landed (i.e. weren't already owned)
//
// Keep these functions tiny + outcome-driven. History-dependent
// achievements ("10 wins in a row") live in src/lib/achievements/
// detect-history.ts (TODO) so the pure outcome path stays cheap.

// ============================================================
// SLOTS
// ============================================================
export function detectSlotsAchievements(ctx: {
  bet: number;
  /** Total payout for the spin (line wins + jackpot). */
  payout: number;
  jackpotHit: boolean;
  bonusTriggered: boolean;
  meterForced: boolean;
}): string[] {
  const out = ["first_spin"]; // every spin
  if (ctx.payout > 0) out.push("first_win");
  if (ctx.bonusTriggered) out.push("bonus_triggered");
  if (ctx.jackpotHit) out.push("jackpot");
  if (ctx.meterForced) out.push("meter_max");
  if (ctx.bet > 0 && ctx.payout >= ctx.bet * 100) out.push("big_multi");
  return out;
}

// ============================================================
// BLACKJACK (solo)
// ============================================================
export function detectBlackjackAchievements(ctx: {
  /** Net result. Positive = won, 0 = push, negative = lost. */
  net: number;
  /** True if the player's hand was a natural blackjack (Ace + 10 on the deal). */
  naturalBlackjack: boolean;
  /** True if the player won with 5+ cards in hand. */
  fiveCardCharlie: boolean;
  /** True if the player doubled-down on the hand and won. */
  doubledAndWon: boolean;
  /** True if the dealer busted (>21). */
  dealerBust: boolean;
  /** Player's final hand total. */
  playerTotal: number;
  /** Player's final hand card count. */
  playerCardCount: number;
}): string[] {
  const out: string[] = [];
  const won = ctx.net > 0;
  if (won) out.push("first_win");
  if (won && ctx.naturalBlackjack) out.push("blackjack");
  if (won && ctx.fiveCardCharlie) out.push("five_card_charlie");
  if (won && ctx.doubledAndWon) out.push("doubled_win");
  if (won && ctx.dealerBust) out.push("dealer_busts");
  if (won && ctx.playerTotal === 21 && ctx.playerCardCount >= 3 && !ctx.naturalBlackjack) {
    out.push("perfect_21");
  }
  return out;
}

// ============================================================
// BLACKJACK MP (subset of solo's triggers)
// ============================================================
export function detectBlackjackMpAchievements(ctx: {
  net: number;
  naturalBlackjack: boolean;
  fiveCardCharlie: boolean;
  dealerBust: boolean;
}): string[] {
  const out = ["first_seat"]; // taking a seat is enough
  if (ctx.net > 0) out.push("first_win");
  if (ctx.net > 0 && ctx.naturalBlackjack) out.push("blackjack");
  if (ctx.net > 0 && ctx.fiveCardCharlie) out.push("five_card_charlie");
  if (ctx.net > 0 && ctx.dealerBust) out.push("dealer_busts");
  return out;
}

// ============================================================
// COIN FLIP
// ============================================================
export function detectCoinflipAchievements(ctx: {
  side: "heads" | "tails";
  won: boolean;
  bet: number;
}): string[] {
  const out = ["first_flip"];
  if (ctx.won) out.push("first_win");
  if (ctx.won && ctx.side === "heads") out.push("called_heads");
  if (ctx.won && ctx.side === "tails") out.push("called_tails");
  if (ctx.won && ctx.bet >= 1_000_000) out.push("big_flip");
  return out;
}

// ============================================================
// COIN FLIP DUEL — fires on accept/resolve, NOT on open
// ============================================================
export function detectCoinflipDuelAchievements(ctx: {
  role: "challenger" | "acceptor";
  won: boolean | null; // null when an unresolved open
  wager: number;
}): string[] {
  const out: string[] = [];
  if (ctx.role === "challenger") out.push("first_challenge");
  if (ctx.role === "acceptor") out.push("first_accept");
  if (ctx.won === true) out.push("first_win");
  if (ctx.won === true && ctx.wager >= 1_000_000) out.push("big_duel_win");
  return out;
}

// ============================================================
// CRASH
// ============================================================
export function detectCrashAchievements(ctx: {
  /** Set when the player has placed a bet on this round. */
  betPlaced: boolean;
  /** Multiplier at which the player cashed out, or null if busted. */
  cashoutMultiplier: number | null;
}): string[] {
  const out: string[] = [];
  if (ctx.betPlaced) out.push("first_bet");
  if (ctx.cashoutMultiplier != null) {
    out.push("first_cashout");
    if (ctx.cashoutMultiplier >= 10) out.push("ten_x");
    if (ctx.cashoutMultiplier >= 100) out.push("hundred_x");
    if (ctx.cashoutMultiplier >= 1000) out.push("thousand_x");
  }
  return out;
}

// ============================================================
// DICE
// ============================================================
export function detectDiceAchievements(ctx: {
  /** Per the dice engine: target & direction the player wagered on. */
  target: number;
  direction: "over" | "under";
  won: boolean;
  bet: number;
}): string[] {
  const out = ["first_roll"];
  if (ctx.won) out.push("first_win");
  // "Narrow" = target requires a roll in a small slice (≤5%).
  // For over/95 or under/5, the win chance is small.
  const winSlice =
    ctx.direction === "over" ? 100 - ctx.target : ctx.target;
  if (ctx.won && winSlice <= 5) out.push("narrow_win");
  if (ctx.won && winSlice >= 90) out.push("wide_win");
  if (ctx.won && ctx.bet >= 1_000_000) out.push("big_dice");
  return out;
}

// ============================================================
// MINES
// ============================================================
export function detectMinesAchievements(ctx: {
  /** Number of tiles revealed (not counting the bust tile). */
  revealed: number;
  totalGems: number;
  /** True if the game ended by hitting a mine. */
  busted: boolean;
  /** True if the player cashed out before busting. */
  cashedOut: boolean;
}): string[] {
  const out = ["first_dig"];
  if (ctx.cashedOut) out.push("first_cashout");
  if (ctx.cashedOut && ctx.revealed >= 10) out.push("big_clear");
  if (ctx.cashedOut && ctx.revealed >= ctx.totalGems) out.push("near_clear");
  if (ctx.busted && ctx.revealed === 0) out.push("early_bust");
  return out;
}

// ============================================================
// PLINKO
// ============================================================
export function detectPlinkoAchievements(ctx: {
  bet: number;
  payout: number;
  /** 0 = leftmost bucket, rows-1 = rightmost. The outermost edge
   *  buckets (bucket === 0 or rows-1) pay the most. */
  bucket: number;
  rows: number;
  risk: "low" | "med" | "high";
}): string[] {
  const out = ["first_drop"];
  if (ctx.payout > 0) out.push("first_win");
  if (ctx.bucket === 0 || ctx.bucket === ctx.rows - 1) out.push("edge_bucket");
  if (ctx.bet > 0 && ctx.payout >= ctx.bet * 10) out.push("ten_x_plinko");
  if (ctx.risk === "high") out.push("high_risk");
  return out;
}

// ============================================================
// POKER
// ============================================================
export function detectPokerAchievements(ctx: {
  seated: boolean;
  /** Net result of the hand. Positive = won the pot, 0 = uninvolved. */
  net: number;
  /** Whether the player went all-in (called/raised their full stack). */
  allIn: boolean;
  /** Whether the win came from everyone else folding (no showdown). */
  bluffWin: boolean;
  /** Pot the player won. */
  potSize: number;
}): string[] {
  const out: string[] = [];
  if (ctx.seated) out.push("first_seat");
  if (ctx.net > 0) out.push("first_win");
  if (ctx.net > 0 && ctx.allIn) out.push("all_in_win");
  if (ctx.net > 0 && ctx.potSize >= 1_000_000) out.push("big_pot");
  if (ctx.net > 0 && ctx.bluffWin) out.push("bluff_win");
  return out;
}

// ============================================================
// ROULETTE
// ============================================================
export function detectRouletteAchievements(ctx: {
  won: boolean;
  /** True if at least one of the player's bets was a single-number
   *  straight-up bet AND that bet hit. */
  straightUpHit: boolean;
  /** Number of distinct bet positions placed this round. */
  betPositions: number;
  /** Whether the previous round was also a win (for hot_streak). */
  previousWasWin: boolean;
}): string[] {
  const out = ["first_spin"];
  if (ctx.won) out.push("first_win");
  if (ctx.won && ctx.straightUpHit) out.push("straight_up");
  if (ctx.betPositions >= 10) out.push("all_table");
  if (ctx.won && ctx.previousWasWin) out.push("hot_streak");
  return out;
}

// ============================================================
// SCRATCH
// ============================================================
export function detectScratchAchievements(ctx: {
  bet: number;
  payout: number;
  /** Whether this ticket hit the jackpot tier. */
  jackpot: boolean;
  /** "Big win" rough threshold — payout >= 10x the bet. */
}): string[] {
  const out = ["first_ticket"];
  if (ctx.payout > 0) out.push("first_win");
  if (ctx.bet > 0 && ctx.payout >= ctx.bet * 10) out.push("big_win");
  if (ctx.jackpot) out.push("jackpot");
  return out;
}

// ============================================================
// META — cross-game milestones
// ============================================================
export function detectMetaAchievements(ctx: {
  /** Whether this is the player's first-ever bet across any game. */
  isFirstBet: boolean;
  /** Total bets the player has placed across all games (this one inclusive). */
  totalBets: number;
  /** Number of distinct games the player has placed a bet at. */
  distinctGames: number;
  /** Total casino games on the books that meta tracks (11 today —
   *  blackjack, blackjack-mp, coinflip, coinflip-duel, crash, dice,
   *  mines, plinko, poker, roulette, scratch, slots). */
  totalGamesAvailable: number;
  /** Whether this bet drained the player's wallet to zero. */
  drainedWallet: boolean;
}): string[] {
  const out: string[] = [];
  if (ctx.isFirstBet) out.push("first_bet");
  if (ctx.totalBets >= 100) out.push("hundred_bets");
  if (ctx.totalBets >= 1_000) out.push("thousand_bets");
  if (ctx.totalBets >= 10_000) out.push("ten_thousand_bets");
  if (ctx.distinctGames >= ctx.totalGamesAvailable) out.push("played_every_game");
  if (ctx.drainedWallet) out.push("all_in_anywhere");
  return out;
}
