import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getCooldown, setCooldown } from "@/lib/db";
import { COOLDOWN_HOURS, SLICES, spinWheel } from "@/lib/games/dailySpin/engine";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cd = await getCooldown(s.user.id, "daily_spin");
  const availableAt = cd ? new Date(cd.available_at).toISOString() : null;
  const now = Date.now();
  const ready = !cd || new Date(cd.available_at).getTime() <= now;
  return NextResponse.json({ ready, availableAt, slices: SLICES });
}

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cd = await getCooldown(s.user.id, "daily_spin");
  if (cd && new Date(cd.available_at).getTime() > Date.now()) {
    return NextResponse.json(
      { error: "cooldown", availableAt: cd.available_at },
      { status: 429 }
    );
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

  const next = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
  await setCooldown(s.user.id, "daily_spin", next);

  return NextResponse.json({
    ok: true,
    sliceIndex: result.sliceIndex,
    amount: result.amount,
    label: result.label,
    availableAt: next.toISOString(),
    balance: await getBalance(s.user.id),
  });
}
