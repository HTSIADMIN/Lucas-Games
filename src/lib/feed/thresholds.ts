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

/** Window the polling endpoint scans (10 minutes). */
export const FEED_WINDOW_MS = 10 * 60 * 1000;

/** Hard cap on rows returned by both the realtime + polled feed. */
export const MAX_FEED_ROWS = 30;

export type FeedQualification = {
  multiplier: number;
  bigOdds: boolean;
  qualifies: boolean;
};

/** Pure helper — same rule used in both the channel + polling paths. */
export function qualifyBet({ bet, payout }: { bet: number; payout: number }): FeedQualification {
  const net = payout - bet;
  const multiplier = bet > 0 ? payout / bet : 0;
  const bigOdds = payout > 0 && multiplier >= BIG_ODDS_MULTIPLIER;
  const qualifies = Math.abs(net) >= BIG_BET_THRESHOLD || bigOdds;
  return { multiplier, bigOdds, qualifies };
}
