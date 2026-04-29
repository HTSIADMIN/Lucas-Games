import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { ensureTodayChallenges } from "@/lib/challenges/record";
import { findChallenge, renderDescription } from "@/lib/challenges/catalog";

export const runtime = "nodejs";

// Returns the player's three daily challenges (rolled lazily on
// first GET each day) plus their progress + claim state. The client
// polls this when the modal is open to keep progress fresh.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let rows;
  try {
    rows = await ensureTodayChallenges(s.user.id);
  } catch (err) {
    // Most common cause: the daily_challenges table doesn't exist
    // yet because migration 0020 hasn't been applied. Return a
    // structured error so the client can show a real message
    // instead of infinite loading.
    const msg = err instanceof Error ? err.message : "error";
    const isMissingTable =
      msg.includes("relation") && msg.includes("does not exist");
    return NextResponse.json(
      {
        error: isMissingTable ? "table_missing" : "internal",
        message: isMissingTable
          ? "Daily Challenges aren't set up yet — apply migration 0020_daily_challenges.sql."
          : msg,
        challenges: [],
      },
      { status: isMissingTable ? 503 : 500 },
    );
  }
  const challenges = rows.map((row) => {
    const tpl = findChallenge(row.challenge_id);
    return {
      slot: row.slot,
      challengeId: row.challenge_id,
      title: tpl?.title ?? row.challenge_id,
      description: tpl ? renderDescription(tpl.description, row.goal) : `Goal: ${row.goal}`,
      difficulty: row.difficulty,
      goal: row.goal,
      progress: row.progress,
      coinReward: row.coin_reward,
      challengePoints: row.challenge_points,
      completedAt: row.completed_at,
      claimedAt: row.claimed_at,
    };
  });
  return NextResponse.json({ ok: true, day: rows[0]?.day ?? null, challenges });
}
