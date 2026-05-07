import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getActiveEvent } from "@/lib/events/globalEvents";
import { getCooldown, getMonopolyState } from "@/lib/db";
import { clansEnabled, getBonusSpinTokens } from "@/lib/clans/db";
import { ensureTodayChallenges } from "@/lib/challenges/record";

export const runtime = "nodejs";

// Combined per-user app snapshot. Replaces four separate polling
// endpoints called from header/footer fixtures on every authed page:
//
//   /api/wallet/balance       → balance
//   /api/events/active        → event
//   /api/earn/status          → earn (Daily Spin + Monopoly readiness)
//   /api/challenges/state     → dailyClaimable (count only)
//
// Consumed by AppSnapshotProvider via a single ~10s poll, replacing
// the previous 3s + 20s + 30s + 30s independent polls (~25 req/min
// per page → ~6/min).
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();

  // Run independent reads in parallel — each tolerates failure.
  const [balance, event, dailyCd, monopoly, bonusTokens, challenges] = await Promise.all([
    getBalance(s.user.id).catch(() => 0),
    Promise.resolve(getActiveEvent()),
    getCooldown(s.user.id, "daily_spin").catch(() => null),
    getMonopolyState(s.user.id).catch(() => null),
    clansEnabled() ? getBonusSpinTokens(s.user.id).catch(() => 0) : Promise.resolve(0),
    ensureTodayChallenges(s.user.id).catch(() => [] as Awaited<ReturnType<typeof ensureTodayChallenges>>),
  ]);

  const dailyAvailableAt = dailyCd ? new Date(dailyCd.available_at).getTime() : null;
  const dailyCooldownReady = !dailyAvailableAt || dailyAvailableAt <= now;
  const dailySpinReady = dailyCooldownReady || bonusTokens > 0;

  const monoNextAt = monopoly?.next_roll_at ? new Date(monopoly.next_roll_at).getTime() : null;
  const monoReady = !monoNextAt || monoNextAt <= now;

  const dailyClaimable = challenges.reduce(
    (n, row) => n + (row.completed_at && !row.claimed_at ? 1 : 0),
    0,
  );

  return NextResponse.json({
    serverNow: now,
    balance,
    event,
    earn: {
      dailySpin: {
        ready: dailySpinReady,
        nextAt: dailyCooldownReady ? null : dailyAvailableAt,
        bonusTokens,
      },
      monopoly: {
        ready: monoReady,
        nextAt: monoReady ? null : monoNextAt,
      },
    },
    dailyClaimable,
  });
}
