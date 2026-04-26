// Lazy round scheduler. Every API call to /api/games/crash/state runs this.
// No long-lived worker needed — state machine progresses on demand.
//
//   betting (10s)  →  running  →  crashed  →  cooldown (5s)  →  next
//
// The multiplier curve is computed locally on each client from `started_at`.
// Server only owns: round creation, state transitions, cashout validation.

import { randomBytes, randomUUID } from "node:crypto";
import {
  getActiveCrashRound,
  insertCrashRound,
  listOpenCrashBets,
  updateCrashBet,
  updateCrashRound,
  type CrashRound,
} from "@/lib/db";
import { credit } from "@/lib/wallet";
import { multiplierAt, pickCrashPoint, timeForMultiplier } from "./engine";

export const BET_WINDOW_MS = 10_000;
export const COOLDOWN_AFTER_CRASH_MS = 7_000;

export type CrashStateView = {
  round: {
    id: string;
    roundNo: number;
    status: "betting" | "running" | "crashed";
    betCloseAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    nowMs: number;
    crashAtX: number | null; // only revealed on crashed status
  } | null;
  serverNow: number;
};

/** Return the current round, advancing the state machine if needed. */
export async function getCrashState(): Promise<CrashStateView> {
  const r = await advance();
  return {
    serverNow: Date.now(),
    round: r
      ? {
          id: r.id,
          roundNo: r.round_no,
          status: r.status as "betting" | "running" | "crashed",
          betCloseAt: r.bet_close_at,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          nowMs: Date.now(),
          crashAtX: r.status === "crashed" ? Number(r.crash_at_x) : null,
        }
      : null,
  };
}

/**
 * Returns the active round (creating one if appropriate and progressing
 * stale states). May return null briefly during the post-crash cooldown.
 */
async function advance(): Promise<CrashRound | null> {
  const now = Date.now();
  let r = await getActiveCrashRound();

  // No active round → consider creating one.
  if (!r) {
    return await maybeCreateNewRound(now);
  }

  // Betting window over?
  if (r.status === "betting" && r.bet_close_at) {
    if (now >= new Date(r.bet_close_at).getTime()) {
      r = (await updateCrashRound(r.id, {
        status: "running",
        started_at: new Date(now).toISOString(),
      })) ?? r;
    }
  }

  // Curve crossed crash point?
  if (r && r.status === "running" && r.started_at) {
    const elapsed = (now - new Date(r.started_at).getTime()) / 1000;
    const live = multiplierAt(elapsed);
    if (live >= Number(r.crash_at_x)) {
      r = (await updateCrashRound(r.id, {
        status: "crashed",
        ended_at: new Date(now).toISOString(),
      })) ?? r;
      // Settle any still-open bets as bust (cashout = 0).
      const open = await listOpenCrashBets(r.id);
      for (const b of open) {
        await updateCrashBet(b.id, { cashout_at_x: 0, payout: 0 });
      }
    }
  }

  // Crashed and cooldown over → schedule a new round.
  if (r && r.status === "crashed" && r.ended_at) {
    const cooldownDone = now >= new Date(r.ended_at).getTime() + COOLDOWN_AFTER_CRASH_MS;
    if (cooldownDone) {
      return await maybeCreateNewRound(now);
    }
  }

  return r;
}

async function maybeCreateNewRound(now: number): Promise<CrashRound> {
  const id = randomUUID();
  const seed = randomBytes(8).toString("hex");
  const crash_at_x = pickCrashPoint();
  const round: CrashRound = {
    id,
    seed,
    crash_at_x,
    bet_close_at: new Date(now + BET_WINDOW_MS).toISOString(),
    started_at: null,
    ended_at: null,
    status: "betting",
    created_by: null,
    round_no: 0,
  };
  return await insertCrashRound(round);
}

/** Force-settle a stale running round whose curve has passed crash. */
export async function settleStaleRound(roundId: string): Promise<void> {
  const r = await import("@/lib/db").then((m) => m.getCrashRound(roundId));
  if (!r || r.status !== "running" || !r.started_at) return;
  const elapsed = (Date.now() - new Date(r.started_at).getTime()) / 1000;
  if (multiplierAt(elapsed) < Number(r.crash_at_x)) return;
  await updateCrashRound(r.id, { status: "crashed", ended_at: new Date().toISOString() });
  const open = await listOpenCrashBets(r.id);
  for (const b of open) {
    await updateCrashBet(b.id, { cashout_at_x: 0, payout: 0 });
  }
}

/** Compute when the round will crash, in ms from epoch. */
export function expectedCrashAtMs(round: { started_at: string | null; crash_at_x: number }): number | null {
  if (!round.started_at) return null;
  return new Date(round.started_at).getTime() + timeForMultiplier(Number(round.crash_at_x)) * 1000;
}
