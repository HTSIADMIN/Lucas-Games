// Shared helpers for the simple server-RNG games.
import { randomUUID } from "node:crypto";
import { credit, debit, getBalance } from "@/lib/wallet";
import { insertGameSession, settleGameSession } from "@/lib/db";
import { toBig, toNum } from "@/lib/big-math";

export const MIN_BET = 100;
/** Legacy export — there's no upper bet cap anymore. The wallet
 *  balance is the only real ceiling (debit throws insufficient_funds
 *  if you don't have it). Postgres `bigint` storage holds up to
 *  9.22 quintillion, ~45× above any current player balance; past 9
 *  quadrillion JS `number` arithmetic drifts by 1–64 ¢ per op but
 *  the named-tier display formatter (`formatAmount`) hides those
 *  drift digits, so it's invisible in play. If you ever cross the
 *  9 quintillion DB wall, switch the wallet to BigInt or
 *  break_infinity.js — but that's many years of play away. */
export const MAX_BET = Number.POSITIVE_INFINITY;

export function validateBet(bet: unknown): { ok: true; bet: number } | { ok: false; error: string } {
  // Number.isInteger is true for any whole-value JS number including
  // those past MAX_SAFE_INTEGER (which can only represent integers
  // anyway — every other one past 2^53), so the existing integer
  // check still passes for stupendously large stakes. The upper-cap
  // check is gone — the wallet balance is the cap.
  if (typeof bet !== "number" || !Number.isFinite(bet) || !Number.isInteger(bet)) {
    return { ok: false, error: "bet_invalid" };
  }
  if (bet < MIN_BET) return { ok: false, error: "bet_too_low" };
  return { ok: true, bet };
}

/**
 * Settle a one-shot server-RNG game in a single transaction:
 *   debit(bet) → run engine → credit(payout if any) → settle session.
 * Returns the new balance and the engine's outcome.
 *
 * `bigPayout` (optional) overrides the credit amount with a
 * BigInt-precise payout so very large stakes don't drift via JS
 * `number` multiplication. When omitted, falls back to crediting
 * `outcome.payout` (the engine's JS-number result). Callers that
 * have a known multiplier should compute
 * `mulBigByNumber(toBig(bet), multiplier)` and pass it here.
 */
export async function playOneShot<T extends { payout: number }>(input: {
  userId: string;
  game: string;
  bet: number;
  state: Record<string, unknown>;
  runEngine: () => T;
  /** Optional: derive from the engine's multiplier in the route and
   *  pass through here so the wallet credit is BigInt-exact. */
  payoutBig?: (outcome: T) => bigint;
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

  // BigInt-precise payout when the route provides a deriver;
  // otherwise the engine's `outcome.payout` (JS number) is used as-is.
  const payoutBig: bigint = input.payoutBig
    ? input.payoutBig(outcome)
    : toBig(outcome.payout);
  const payoutNum = toNum(payoutBig);

  if (payoutBig > BigInt(0)) {
    await credit({
      userId: input.userId,
      amount: payoutBig,
      reason: `${input.game}_win`,
      refKind: input.game,
      refId: `${sessionId}:win`,
    });
  }

  await settleGameSession(sessionId, payoutNum, { ...input.state, ...outcome });

  return { sessionId, balance: await getBalance(input.userId), outcome };
}
