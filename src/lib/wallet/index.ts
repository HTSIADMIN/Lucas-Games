// SINGLE CHOKEPOINT for wallet writes. No game code may insert into
// wallet_transactions directly — always go through credit/debit.

import { insertWalletTransaction, walletBalance, walletBalanceExact } from "@/lib/db";
import { recordChallengeEvent } from "@/lib/challenges/record";
import { maybeBoostWin } from "@/lib/events/globalEvents";
import type { GameSlug } from "@/lib/challenges/catalog";

export type WalletWrite = {
  userId: string;
  /** Positive integer of coins. Accepts `number` (callers stay
   *  unchanged) or `bigint` (precise past 9 quadrillion). Internally
   *  normalized to BigInt so the insufficient-funds gate compares
   *  the real ledger sum, not a Number-rounded approximation. */
  amount: number | bigint;
  reason: string;
  refKind?: string;
  refId?: string;
};

/** Coerce a wallet amount to a positive BigInt. Throws on garbage
 *  (NaN, Infinity, non-positive, fractional) so the wallet never
 *  records nonsense. */
function toPositiveBigInt(amount: number | bigint): bigint {
  if (typeof amount === "bigint") {
    if (amount <= BigInt(0)) throw new Error("invalid_amount");
    return amount;
  }
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error("invalid_amount");
  }
  // Math.floor + BigInt is exact for any integer-valued double — past
  // Number.MAX_SAFE_INTEGER every representable double IS an integer
  // anyway (every other one, then every fourth, etc.).
  return BigInt(Math.floor(amount));
}

/** Map a wallet `reason` string to the GameSlug used by the
 *  challenge catalog. Returning null means the reason isn't a
 *  challenge-relevant event. Bet (debit) and win (credit) reasons
 *  share the same prefix per game, so this is the single source of
 *  truth for which reasons feed the daily challenges system. */
function gameSlugForReason(reason: string): GameSlug | null {
  const map: Record<string, GameSlug> = {
    // Bets (debits)
    slots_bet: "slots", blackjack_bet: "blackjack", roulette_bet: "roulette",
    mines_bet: "mines", crash_bet: "crash", plinko_bet: "plinko",
    dice_bet: "dice", coinflip_bet: "coinflip",
    blackjack_mp_bet: "blackjack_mp", coinflip_duel_bet: "coinflip_duel",
    poker_bet: "poker", scratch_bet: "scratch",
    // Settles / wins (credits)
    slots_win: "slots", slots_bonus_win: "slots",
    blackjack_win: "blackjack", blackjack_payout: "blackjack",
    blackjack_mp_win: "blackjack_mp",
    roulette_win: "roulette",
    roulette_settle: "roulette", roulette_hot_bonus: "roulette",
    mines_cashout: "mines",
    crash_cashout: "crash",
    plinko_win: "plinko",
    dice_win: "dice",
    coinflip_win: "coinflip",
    coinflip_duel_win: "coinflip_duel",
    poker_win: "poker",
  };
  return map[reason] ?? null;
}

/** Reasons that record a "play" event (the player just put money on
 *  the table). Mirrored from gameSlugForReason but only the
 *  bet-flavored side. */
const BET_REASONS = new Set<string>([
  "slots_bet", "blackjack_bet", "roulette_bet", "mines_bet",
  "crash_bet", "plinko_bet", "dice_bet", "coinflip_bet",
  "blackjack_mp_bet", "coinflip_duel_bet", "poker_bet", "scratch_bet",
]);

/** Reasons that record a "win" event. Excludes refunds and the
 *  scratch payout (which credits regardless of win/loss tier). */
const WIN_REASONS = new Set<string>([
  "slots_win", "slots_bonus_win",
  "blackjack_win", "blackjack_payout", "blackjack_mp_win",
  "roulette_win", "roulette_settle", "roulette_hot_bonus",
  "mines_cashout", "crash_cashout", "plinko_win",
  "dice_win", "coinflip_win", "coinflip_duel_win", "poker_win",
]);

/** Public balance read — returns a JS `number` so existing callers,
 *  JSON responses, and React clients keep working without any code
 *  changes. Past 9 quadrillion this drifts by 1–64 ¢ vs. the true
 *  ledger sum; the named-tier formatter hides those digits in the
 *  UI. Use `getBalanceExact` when you need precise comparison. */
export async function getBalance(userId: string): Promise<number> {
  return walletBalance(userId);
}

/** BigInt-precise balance read for internal use. The `insufficient_
 *  funds` gate inside `debit` uses this so a player past 9 quadrillion
 *  can't accidentally over-bet because of Number rounding. */
export async function getBalanceExact(userId: string): Promise<bigint> {
  return walletBalanceExact(userId);
}

export async function credit(input: WalletWrite) {
  const amount = toPositiveBigInt(input.amount);
  // Lucky Hour boost — when a global "lucky hour" event is active,
  // all win-flavored credits get bumped before they hit the
  // ledger. Refunds, shop refunds, challenge rewards, and
  // pack trade-ins are excluded so the boost only inflates real
  // gameplay payouts. maybeBoostWin still operates in JS-number
  // land (it multiplies by a 1.x float), so we round-trip the
  // amount through Number for the boost and back to BigInt for
  // the ledger insert. The boost factor is small so the drift
  // from this single Number trip is the bonus ratio's worth — a
  // ≤ 64 ¢ rounding error on a quintillion-coin payout.
  let finalAmount = amount;
  let bonus = BigInt(0);
  if (WIN_REASONS.has(input.reason)) {
    const boosted = maybeBoostWin(Number(amount));
    finalAmount = BigInt(Math.floor(boosted.amount));
    bonus = BigInt(Math.floor(boosted.bonus));
  }
  void bonus; // currently only used for future telemetry
  const result = await insertWalletTransaction({
    user_id: input.userId,
    delta: finalAmount,
    reason: input.reason,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
  });
  if (WIN_REASONS.has(input.reason)) {
    const game = gameSlugForReason(input.reason);
    if (game) {
      recordChallengeEvent(input.userId, { kind: "win_game", game, payout: Number(finalAmount) })
        .catch(() => { /* ignore */ });
    }
  }
  return result;
}

export async function debit(input: WalletWrite) {
  const amount = toPositiveBigInt(input.amount);
  // BigInt-precise insufficient-funds check so a quintillion-coin
  // player can bet their full stack without Number drift falsely
  // failing the gate.
  const balance = await walletBalanceExact(input.userId);
  if (balance < amount) {
    throw new Error("insufficient_funds");
  }
  const result = await insertWalletTransaction({
    user_id: input.userId,
    delta: -amount,
    reason: input.reason,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
  });
  if (BET_REASONS.has(input.reason)) {
    const game = gameSlugForReason(input.reason);
    if (game) {
      recordChallengeEvent(input.userId, { kind: "play_game", game, betAmount: Number(amount) })
        .catch(() => { /* ignore */ });
    }
  } else if (input.reason === "monopoly_pack") {
    recordChallengeEvent(input.userId, { kind: "buy_monopoly_pack" }).catch(() => { /* ignore */ });
  } else if (input.reason.startsWith("shop_pack_")) {
    recordChallengeEvent(input.userId, { kind: "buy_shop_pack" }).catch(() => { /* ignore */ });
  }
  if (input.reason === "scratch_bet") {
    recordChallengeEvent(input.userId, { kind: "buy_scratch_ticket" }).catch(() => { /* ignore */ });
  }
  return result;
}
