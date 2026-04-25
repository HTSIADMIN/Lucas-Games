// SINGLE CHOKEPOINT for wallet writes. No game code may insert
// into wallet_transactions directly — always go through credit/debit.

import { insertWalletTransaction, walletBalance } from "@/lib/db";

export type WalletWrite = {
  userId: string;
  amount: number; // positive integer of coins
  reason: string;
  refKind?: string;
  refId?: string;
};

export type WalletError = "insufficient_funds" | "invalid_amount";

export function getBalance(userId: string): number {
  return walletBalance(userId);
}

export function credit(input: WalletWrite) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isInteger(input.amount)) {
    throw new Error("invalid_amount");
  }
  return insertWalletTransaction({
    user_id: input.userId,
    delta: input.amount,
    reason: input.reason,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
  });
}

export function debit(input: WalletWrite) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isInteger(input.amount)) {
    throw new Error("invalid_amount");
  }
  const balance = walletBalance(input.userId);
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
