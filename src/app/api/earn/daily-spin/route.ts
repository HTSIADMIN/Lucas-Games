import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getCooldown, setCooldown } from "@/lib/db";
import { COOLDOWN_HOURS, SLICES, spinWheel } from "@/lib/games/dailySpin/engine";
import { clansEnabled, consumeBonusSpinToken, getBonusSpinTokens } from "@/lib/clans/db";
import { recordChallengeEvent } from "@/lib/challenges/record";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cd = await getCooldown(s.user.id, "daily_spin");
  const availableAt = cd ? new Date(cd.available_at).toISOString() : null;
  const now = Date.now();
  const cooldownReady = !cd || new Date(cd.available_at).getTime() <= now;
  const bonusTokens = clansEnabled() ? await getBonusSpinTokens(s.user.id) : 0;
  const ready = cooldownReady || bonusTokens > 0;
  return NextResponse.json({ ready, availableAt, slices: SLICES, bonusTokens });
}

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cd = await getCooldown(s.user.id, "daily_spin");
  const onCooldown = cd && new Date(cd.available_at).getTime() > Date.now();
  let usedBonus = false;
  if (onCooldown) {
    // Try to consume a bonus token instead of failing.
    if (clansEnabled() && (await consumeBonusSpinToken(s.user.id))) {
      usedBonus = true;
    } else {
      return NextResponse.json(
        { error: "cooldown", availableAt: cd!.available_at },
        { status: 429 }
      );
    }
  }

  const result = spinWheel();
  const claimId = randomUUID();
  await credit({
    userId: s.user.id,
    amount: result.amount,
    reason: "daily_spin",
    refKind: "daily_spin",
    refId: claimId,
  });
  recordChallengeEvent(s.user.id, { kind: "use_daily_spin" }).catch(() => { /* ignore */ });

  // Only set the cooldown if this was the regular daily spin, not a bonus.
  let availableAt: string | null = cd?.available_at ?? null;
  if (!usedBonus) {
    const next = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
    await setCooldown(s.user.id, "daily_spin", next);
    availableAt = next.toISOString();
  }

  return NextResponse.json({
    ok: true,
    sliceIndex: result.sliceIndex,
    amount: result.amount,
    label: result.label,
    availableAt,
    usedBonus,
    bonusTokens: clansEnabled() ? await getBonusSpinTokens(s.user.id) : 0,
    balance: await getBalance(s.user.id),
  });
}
