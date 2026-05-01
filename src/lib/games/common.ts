// Shared helpers for the simple server-RNG games.
import { randomUUID } from "node:crypto";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";

export const MIN_BET = 100;
/** Hard ceiling on a single bet across every server-RNG game.
 *  Wallet balances are bigint at the DB level so we have plenty of
 *  headroom. 100B is the agreed cap. */
export const MAX_BET = 100_000_000_000;

export function validateBet(bet: unknown): { ok: true; bet: number } | { ok: false; error: string } {
  if (typeof bet !== "number" || !Number.isFinite(bet) || !Number.isInteger(bet)) {
    return { ok: false, error: "bet_invalid" };
  }
  if (bet < MIN_BET) return { ok: false, error: "bet_too_low" };
  if (bet > MAX_BET) return { ok: false, error: "bet_too_high" };
  return { ok: true, bet };
}

/**
 * Settle a one-shot server-RNG game in a single transaction:
 *   debit(bet) → run engine → credit(payout if any) → settle session.
 * Returns the new balance and the engine's outcome.
 */
export async function playOneShot<T extends { payout: number }>(input: {
  userId: string;
  game: string;
  bet: number;
  state: Record<string, unknown>;
  runEngine: () => T;
}): Promise<{ sessionId: string; balance: number; outcome: T }> {
  const sessionId = randomUUID();

  await debit({
    userId: input.userId,
    amount: input.bet,
    reason: `${input.game}_bet`,
    refKind: input.game,
    refId: `${sessionId}:bet`,
  });

  await insertGameSession({
    id: sessionId,
    user_id: input.userId,
    game: input.game,
    bet: input.bet,
    payout: 0,
    state: input.state,
    status: "open",
  });

  const outcome = input.runEngine();

  if (outcome.payout > 0) {
    await credit({
      userId: input.userId,
      amount: outcome.payout,
      reason: `${input.game}_win`,
      refKind: input.game,
      refId: `${sessionId}:win`,
    });
  }

  await settleGameSession(sessionId, outcome.payout, { ...input.state, ...outcome });

  return { sessionId, balance: await getBalance(input.userId), outcome };
}
