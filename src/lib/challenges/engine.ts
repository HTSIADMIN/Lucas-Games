// Daily challenge engine: day-key calc, deterministic 3-of-N roll
// per (user, day), and event matching for progress accrual.

import { randomInt } from "node:crypto";
import {
  CHALLENGES,
  REWARDS_BY_DIFFICULTY,
  type ChallengeDifficulty,
  type ChallengeMetric,
  type ChallengeTemplate,
  type GameSlug,
} from "./catalog";

/** Today's UTC day key as YYYY-MM-DD. The clan week is Mon→Mon UTC,
 *  so all day-bound state aligns. */
export function dayKey(d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Pick one challenge of each difficulty. Truly random — we want the
 *  daily mix to differ across players so trade-banter has something
 *  to feed on. Goal is also rolled per-player. */
export type RolledChallenge = {
  slot: 0 | 1 | 2;
  challengeId: string;
  goal: number;
  coinReward: number;
  challengePoints: number;
  difficulty: ChallengeDifficulty;
};

const DIFFICULTY_ORDER: ChallengeDifficulty[] = ["easy", "medium", "hard"];

export function rollDailyChallenges(): RolledChallenge[] {
  return DIFFICULTY_ORDER.map((diff, i) => {
    const pool = CHALLENGES.filter((c) => c.difficulty === diff);
    const tpl = pool[randomInt(0, pool.length)];
    const goal = tpl.goalMin === tpl.goalMax
      ? tpl.goalMin
      : randomInt(tpl.goalMin, tpl.goalMax + 1);
    const reward = REWARDS_BY_DIFFICULTY[diff];
    return {
      slot: i as 0 | 1 | 2,
      challengeId: tpl.id,
      goal,
      coinReward: reward.coins,
      challengePoints: reward.points,
      difficulty: diff,
    };
  });
}

// =============================================================
// Event matching
// =============================================================
//
// Game routes call recordChallengeEvent(userId, event) at the same
// point they touch the wallet ledger. The challenge engine matches
// the event against each of today's challenges and bumps progress.

export type ChallengeEvent =
  | { kind: "play_game"; game: GameSlug; betAmount: number }
  | { kind: "win_game"; game: GameSlug; payout: number }
  | { kind: "use_daily_spin" }
  | { kind: "use_monopoly_roll" }
  | { kind: "buy_scratch_ticket" }
  | { kind: "buy_shop_pack" }
  | { kind: "buy_monopoly_pack" }
  | { kind: "score"; game: "flappy" | "crossy_road"; score: number };

/** Translate one event → progress delta for a given challenge metric.
 *  Returns the increment to add to the row's `progress`, or 0 when
 *  the event doesn't match. */
export function progressFor(
  metric: ChallengeMetric,
  event: ChallengeEvent,
): number {
  switch (metric.kind) {
    case "play_any_game":
      return event.kind === "play_game" ? 1 : 0;
    case "play_specific_game":
      return event.kind === "play_game" && event.game === metric.game ? 1 : 0;
    case "spend_total_coins":
      return event.kind === "play_game" ? Math.max(0, Math.floor(event.betAmount)) : 0;
    case "win_any_game":
      return event.kind === "win_game" ? 1 : 0;
    case "win_specific_game":
      return event.kind === "win_game" && event.game === metric.game ? 1 : 0;
    case "use_daily_spin":
      return event.kind === "use_daily_spin" ? 1 : 0;
    case "use_monopoly_roll":
      return event.kind === "use_monopoly_roll" ? 1 : 0;
    case "buy_scratch_ticket":
      return event.kind === "buy_scratch_ticket" ? 1 : 0;
    case "buy_shop_pack":
      return event.kind === "buy_shop_pack" ? 1 : 0;
    case "buy_monopoly_pack":
      return event.kind === "buy_monopoly_pack" ? 1 : 0;
    case "score_threshold":
      // Score challenges complete in one shot once the threshold is
      // hit. The catalog snapshots goalMin = goalMax = metric.score
      // into the daily_challenges row's `goal`, so this returns
      // exactly that goal value the first time the score event
      // clears the bar — bumping progress straight to completion.
      return event.kind === "score" && event.game === metric.game && event.score >= metric.score
        ? metric.score
        : 0;
  }
}

export function templateOrUndefined(id: string): ChallengeTemplate | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
