import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { debit, getBalance } from "@/lib/wallet";
import { getMonopolyOwned, upsertMonopolyOwned } from "@/lib/db";
import { PROPERTIES, PACK_PRICE, PACK_SIZE, TIER_WEIGHT, findProperty, type PropertyTier } from "@/lib/games/monopoly/board";
import { randInt } from "@/lib/games/rng";

export const runtime = "nodejs";

function rollPropertyId(): string {
  // Pick tier by weight, then a random property in that tier.
  const total = (Object.values(TIER_WEIGHT) as number[]).reduce((a, b) => a + b, 0);
  let r = randInt(0, total - 1);
  let pickedTier: PropertyTier = 1;
  for (const t of [1, 2, 3, 4, 5] as PropertyTier[]) {
    r -= TIER_WEIGHT[t];
    if (r < 0) { pickedTier = t; break; }
  }
  const inTier = PROPERTIES.filter((p) => p.tier === pickedTier);
  const idx = randInt(0, inTier.length - 1);
  return inTier[idx].id;
}

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await debit({
      userId: s.user.id,
      amount: PACK_PRICE,
      reason: "monopoly_pack",
      refKind: "monopoly_pack",
      refId: `${randomUUID()}:buy`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  const drawn: string[] = [];
  for (let i = 0; i < PACK_SIZE; i++) drawn.push(rollPropertyId());

  // Tally counts and write to inventory.
  const counts: Record<string, number> = {};
  for (const id of drawn) counts[id] = (counts[id] ?? 0) + 1;
  for (const [pid, n] of Object.entries(counts)) {
    const cur = await getMonopolyOwned(s.user.id, pid);
    await upsertMonopolyOwned({
      user_id: s.user.id,
      property_id: pid,
      level: cur?.level ?? 0,
      card_count: (cur?.card_count ?? 0) + n,
    });
  }

  const cards = drawn.map((id) => findProperty(id)!);
  return NextResponse.json({
    ok: true,
    cards,
    balance: await getBalance(s.user.id),
  });
}
