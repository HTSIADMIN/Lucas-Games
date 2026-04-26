import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { debit, getBalance } from "@/lib/wallet";
import { getMonopolyOwned, upsertMonopolyOwned } from "@/lib/db";
import { findProperty, MAX_LEVEL, nextUpgradeCost } from "@/lib/games/monopoly/board";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { propertyId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.propertyId) return NextResponse.json({ error: "missing_property" }, { status: 400 });
  const prop = findProperty(body.propertyId);
  if (!prop) return NextResponse.json({ error: "unknown_property" }, { status: 404 });

  const owned = await getMonopolyOwned(s.user.id, prop.id);
  if (!owned) return NextResponse.json({ error: "not_owned" }, { status: 400 });
  if (owned.level >= MAX_LEVEL) return NextResponse.json({ error: "max_level" }, { status: 400 });

  const cost = nextUpgradeCost(owned.level);
  if (!cost) return NextResponse.json({ error: "max_level" }, { status: 400 });
  if (owned.card_count < cost.cards) {
    return NextResponse.json({ error: "not_enough_cards", needed: cost.cards, have: owned.card_count }, { status: 400 });
  }

  // Debit coin cost.
  try {
    await debit({
      userId: s.user.id,
      amount: cost.coins,
      reason: "monopoly_upgrade",
      refKind: "monopoly_upgrade",
      refId: `${randomUUID()}:up`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  // Consume cards, increment level.
  const newRow = await upsertMonopolyOwned({
    user_id: s.user.id,
    property_id: prop.id,
    level: owned.level + 1,
    card_count: owned.card_count - cost.cards,
  });

  return NextResponse.json({
    ok: true,
    propertyId: prop.id,
    level: newRow.level,
    remainingCards: newRow.card_count,
    balance: await getBalance(s.user.id),
  });
}
