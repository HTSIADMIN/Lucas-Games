// SINGLE CHOKEPOINT for wallet writes. No game code may insert into
// wallet_transactions directly — always go through credit/debit.

import { insertWalletTransaction, walletBalance } from "@/lib/db";
import { addClanXp, clansEnabled } from "@/lib/clans/db";

export type WalletWrite = {
  userId: string;
  amount: number; // positive integer of coins
  reason: string;
  refKind?: string;
  refId?: string;
};

// Reasons that count as a "win" for clan XP. Refund and shop reasons are
// excluded so giving someone money doesn't bump clan XP.
const WIN_REASONS = new Set<string>([
  "blackjack_win", "slots_win", "slots_bonus_win", "roulette_win",
  "coinflip_win", "dice_win", "crash_cashout", "mines_cashout",
  "plinko_win", "poker_win", "coinflip_duel_win", "blackjack_mp_win",
  "daily_spin", "crossy_road", "flappy", "monopoly_payout", "tip_received",
  "blackjack_payout",
]);

const COIN_PER_XP = 100;

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
  // Clan XP accrual — fire-and-forget so wallet writes never fail because
  // of clan plumbing. XP scales the same as personal XP (100¢ = 1 XP).
  if (clansEnabled() && WIN_REASONS.has(input.reason)) {
    const xpDelta = Math.floor(input.amount / COIN_PER_XP);
    if (xpDelta > 0) {
      addClanXp(input.userId, xpDelta).catch(() => { /* ignore */ });
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
  return insertWalletTransaction({
    user_id: input.userId,
    delta: -input.amount,
    reason: input.reason,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
  });
}
