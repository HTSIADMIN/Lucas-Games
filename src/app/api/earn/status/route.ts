import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getCooldown, getMonopolyState } from "@/lib/db";
import { clansEnabled, getBonusSpinTokens } from "@/lib/clans/db";

export const runtime = "nodejs";

// Lightweight readiness probe used by the lobby's Free Games button + modal.
// Returns enough state for the UI to (1) shimmer when something is ready and
// (2) show a countdown on the Daily Spin / Monopoly tiles.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();

  // Daily spin
  const cd = await getCooldown(s.user.id, "daily_spin");
  const dailyAvailableAt = cd ? new Date(cd.available_at).getTime() : null;
  const dailyCooldownReady = !dailyAvailableAt || dailyAvailableAt <= now;
  const bonusTokens = clansEnabled() ? await getBonusSpinTokens(s.user.id) : 0;
  const dailySpinReady = dailyCooldownReady || bonusTokens > 0;

  // Monopoly hourly roll
  const mono = await getMonopolyState(s.user.id);
  const monoNextAt = mono?.next_roll_at ? new Date(mono.next_roll_at).getTime() : null;
  const monoReady = !monoNextAt || monoNextAt <= now;

  return NextResponse.json({
    serverNow: now,
    dailySpin: {
      ready: dailySpinReady,
      nextAt: dailyCooldownReady ? null : dailyAvailableAt,
      bonusTokens,
    },
    monopoly: {
      ready: monoReady,
      nextAt: monoReady ? null : monoNextAt,
    },
  });
}
