// Big-bets feed qualification thresholds. Shared between the realtime
// channel filter (LiveProvider) and the polling endpoint
// (/api/feed/big-bets) so both surfaces stay in sync.

/** |payout - bet| this large or larger qualifies as a "big bet". */
export const BIG_BET_THRESHOLD = 50_000;

/**
 * Wins paying back at least this multiple of the wager qualify as
 * "big odds" regardless of bet size — so a 1%-shot longshot from a
 * tiny stake still pops into the feed.
 */
export const BIG_ODDS_MULTIPLIER = 50;

/**
 * If the absolute net swing is at least this fraction of the
 * player's pre-bet wealth, qualify as a "big swing relative to
 * wealth" — pulls a $5k loss for a $10k player into the feed
 * even though it'd otherwise miss the absolute threshold. Same
 * fraction is used to fire the bottom-left win/loss toast.
 */
export const BIG_WEALTH_FRACTION = 0.30;

/** Don't fire the wealth-relative qualifier for trivial pre-bet
 *  wealth — a player at 100¢ losing 60¢ shouldn't toast. */
export const MIN_WEALTH_FOR_BIG_FRACTION = 5_000;

/** Window the polling endpoint scans (10 minutes). */
export const FEED_WINDOW_MS = 10 * 60 * 1000;

/** Hard cap on rows returned by both the realtime + polled feed. */
export const MAX_FEED_ROWS = 30;

export type FeedQualification = {
  multiplier: number;
  bigOdds: boolean;
  bigWealth: boolean;
  qualifies: boolean;
};

/** Pure helper — same rule used in both the channel + polling paths.
 *  `wealth` is the player's pre-bet balance (current_balance - net).
 *  When provided, a swing of ≥30% of that wealth also qualifies. */
export function qualifyBet({
  bet,
  payout,
  wealth,
}: {
  bet: number;
  payout: number;
  wealth?: number;
}): FeedQualification {
  const net = payout - bet;
  const multiplier = bet > 0 ? payout / bet : 0;
  const bigOdds = payout > 0 && multiplier >= BIG_ODDS_MULTIPLIER;
  const bigWealth =
    wealth != null &&
    wealth >= MIN_WEALTH_FOR_BIG_FRACTION &&
    Math.abs(net) / wealth >= BIG_WEALTH_FRACTION;
  const qualifies =
    Math.abs(net) >= BIG_BET_THRESHOLD || bigOdds || bigWealth;
  return { multiplier, bigOdds, bigWealth, qualifies };
}
