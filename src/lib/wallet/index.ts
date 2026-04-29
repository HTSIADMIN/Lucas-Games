// SINGLE CHOKEPOINT for wallet writes. No game code may insert into
// wallet_transactions directly — always go through credit/debit.

import { insertWalletTransaction, walletBalance } from "@/lib/db";
import { recordChallengeEvent } from "@/lib/challenges/record";
import type { GameSlug } from "@/lib/challenges/catalog";

export type WalletWrite = {
  userId: string;
  amount: number; // positive integer of coins
  reason: string;
  refKind?: string;
  refId?: string;
};

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

export async function getBalance(userId: string): Promise<number> {
  return walletBalance(userId);
}

export async function credit(input: WalletWrite) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isInteger(input.amount)) {
    throw new Error("invalid_amount");
  }
  const result = await insertWalletTransaction({
    user_id: input.userId,
    delta: input.amount,
    reason: input.reason,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
  });
  // Daily-challenge progress for win-flavored credits. Fire-and-
  // forget so a flaky challenge write can never break a credit.
  if (WIN_REASONS.has(input.reason)) {
    const game = gameSlugForReason(input.reason);
    if (game) {
      recordChallengeEvent(input.userId, { kind: "win_game", game, payout: input.amount })
        .catch(() => { /* ignore */ });
    }
  }
  return result;
}

export async function debit(input: WalletWrite) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isInteger(input.amount)) {
    throw new Error("invalid_amount");
  }
  const balance = await walletBalance(input.userId);
  if (balance < input.amount) {
    throw new Error("insufficient_funds");
  }
  const result = await insertWalletTransaction({
    user_id: input.userId,
    delta: -input.amount,
    reason: input.reason,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
  });
  // Daily-challenge progress for game-bet debits.
  if (BET_REASONS.has(input.reason)) {
    const game = gameSlugForReason(input.reason);
    if (game) {
      recordChallengeEvent(input.userId, { kind: "play_game", game, betAmount: input.amount })
        .catch(() => { /* ignore */ });
    }
  } else if (input.reason === "monopoly_pack") {
    recordChallengeEvent(input.userId, { kind: "buy_monopoly_pack" }).catch(() => { /* ignore */ });
  } else if (input.reason.startsWith("shop_pack_")) {
    recordChallengeEvent(input.userId, { kind: "buy_shop_pack" }).catch(() => { /* ignore */ });
  }
  // Scratch buy is also recorded as buy_scratch_ticket (the
  // play_game event already fired above for scratch_bet so the
  // "wager total coins" challenge progresses too).
  if (input.reason === "scratch_bet") {
    recordChallengeEvent(input.userId, { kind: "buy_scratch_ticket" }).catch(() => { /* ignore */ });
  }
  return result;
}
