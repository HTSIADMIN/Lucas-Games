// Single chokepoint for "the player did something the daily
// challenges might care about". Game routes call this with the
// event they just recorded; this matches the event against today's
// 3 challenges and bumps progress on each match.

import {
  bumpDailyChallengeProgress,
  insertDailyChallenges,
  listDailyChallenges,
} from "@/lib/db";
import { findChallenge } from "./catalog";
import { dayKey, progressFor, rollDailyChallenges, type ChallengeEvent } from "./engine";
import type { DailyChallenge } from "@/lib/db/types";

/** Get-or-create today's 3 challenges for the user. Lazy: callers
 *  hit this on read OR before recording the first event of the day,
 *  so we never need a cron to seed rows. */
export async function ensureTodayChallenges(userId: string): Promise<DailyChallenge[]> {
  const day = dayKey();
  const existing = await listDailyChallenges(userId, day);
  if (existing.length === 3) return existing;
  if (existing.length > 0) {
    // Partial state shouldn't happen, but if it does just return what's there.
    return existing;
  }
  const rolled = rollDailyChallenges();
  const now = new Date().toISOString();
  const rows: DailyChallenge[] = rolled.map((r) => ({
    user_id: userId,
    day,
    slot: r.slot,
    challenge_id: r.challengeId,
    goal: r.goal,
    progress: 0,
    coin_reward: r.coinReward,
    challenge_points: r.challengePoints,
    difficulty: r.difficulty,
    completed_at: null,
    claimed_at: null,
    created_at: now,
  }));
  await insertDailyChallenges(rows);
  return rows;
}

/** Record a single challenge event against today's 3 challenges.
 *  Fire-and-forget by callers — failures are swallowed so a flaky
 *  challenge insert can never break a wallet write. */
export async function recordChallengeEvent(userId: string, event: ChallengeEvent): Promise<void> {
  try {
    const rows = await ensureTodayChallenges(userId);
    for (const row of rows) {
      if (row.completed_at) continue;
      const tpl = findChallenge(row.challenge_id);
      if (!tpl) continue;
      const delta = progressFor(tpl.metric, event);
      if (delta > 0) {
        await bumpDailyChallengeProgress(userId, row.day, row.slot, delta);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("recordChallengeEvent failed:", err);
  }
}
