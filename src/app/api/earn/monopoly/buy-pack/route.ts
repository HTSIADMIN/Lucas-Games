import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { listMonopolyOwned, upsertMonopolyOwned } from "@/lib/db";
import {
  MAX_LEVEL,
  MONOPOLY_PACKS,
  PROPERTIES,
  findProperty,
  tradeInForMonopolySlot,
  type MonopolyPackId,
  type MonopolyPackSpec,
  type PropertyTier,
} from "@/lib/games/monopoly/board";
import { randInt } from "@/lib/games/rng";

export const runtime = "nodejs";

/** Pick a tier by weight, then a random property in that tier. */
function rollTierAndProperty(spec: MonopolyPackSpec): { tier: PropertyTier; propertyId: string } {
  const tiers: PropertyTier[] = [1, 2, 3, 4, 5];
  const total = tiers.reduce((sum, t) => sum + (spec.weights[t] ?? 0), 0);
  let r = randInt(0, Math.max(1, total) - 1);
  let pickedTier: PropertyTier = tiers.find((t) => spec.weights[t] > 0) ?? 5;
  for (const t of tiers) {
    if ((spec.weights[t] ?? 0) <= 0) continue;
    r -= spec.weights[t];
    if (r < 0) { pickedTier = t; break; }
  }
  const inTier = PROPERTIES.filter((p) => p.tier === pickedTier);
  const idx = randInt(0, inTier.length - 1);
  return { tier: pickedTier, propertyId: inTier[idx].id };
}

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Pack id is optional for backwards compat with old clients —
  // missing or unknown ids fall back to the original Drifter pack.
  let packId: MonopolyPackId = "drifter";
  try {
    const body = (await req.json().catch(() => ({}))) as { packId?: string };
    if (body.packId && body.packId in MONOPOLY_PACKS) {
      packId = body.packId as MonopolyPackId;
    }
  } catch { /* ignore */ }
  const spec = MONOPOLY_PACKS[packId];

  const buyId = randomUUID();
  try {
    await debit({
      userId: s.user.id,
      amount: spec.price,
      reason: "monopoly_pack",
      refKind: "monopoly_pack",
      refId: `${buyId}:buy`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  // Snapshot the player's collection so we can detect maxed-out
  // properties without a per-card DB round trip.
  const owned = await listMonopolyOwned(s.user.id);
  const ownedLevels = new Map<string, number>(owned.map((o) => [o.property_id, o.level]));
  const isMax = (id: string) => (ownedLevels.get(id) ?? 0) >= MAX_LEVEL;

  type Pull =
    | { kind: "card"; propertyId: string }
    | { kind: "tradein"; coins: number; tier: PropertyTier };

  // Per-slot pull: roll a tier+property by the pack's weights. If
  // the rolled property is already at MAX_LEVEL the slot trades in
  // for coins scaled to the rolled tier. We deliberately don't
  // "walk up" tiers when the rolled property is maxed — that
  // silently promoted cheap-pack rolls into higher-tier cards and
  // hid the trade-in entirely. Instead the player gets a coin
  // reimbursement and the next slot rolls fresh.
  const pulls: Pull[] = [];
  for (let i = 0; i < spec.size; i++) {
    const r = rollTierAndProperty(spec);
    if (isMax(r.propertyId)) {
      pulls.push({
        kind: "tradein",
        coins: tradeInForMonopolySlot(spec, r.tier),
        tier: r.tier,
      });
    } else {
      pulls.push({ kind: "card", propertyId: r.propertyId });
    }
  }

  // Tally property awards and write to inventory.
  const counts: Record<string, number> = {};
  for (const p of pulls) {
    if (p.kind === "card") counts[p.propertyId] = (counts[p.propertyId] ?? 0) + 1;
  }
  for (const [pid, n] of Object.entries(counts)) {
    const cur = owned.find((o) => o.property_id === pid);
    await upsertMonopolyOwned({
      user_id: s.user.id,
      property_id: pid,
      level: cur?.level ?? 0,
      card_count: (cur?.card_count ?? 0) + n,
    });
  }

  // Credit any trade-in coins as a single ledger entry per pack so
  // the wallet history stays clean.
  const tradeInTotal = pulls.reduce((sum, p) => sum + (p.kind === "tradein" ? p.coins : 0), 0);
  if (tradeInTotal > 0) {
    await credit({
      userId: s.user.id,
      amount: tradeInTotal,
      reason: "monopoly_pack_tradein",
      refKind: "monopoly_pack",
      refId: `${buyId}:tradein`,
    });
  }

  // Wire each pull back so the client can render the pack-opening
  // sequence with the right card / coin face per slot.
  const cards = pulls.map((p) => {
    if (p.kind === "card") return { kind: "card" as const, ...findProperty(p.propertyId)! };
    return { kind: "tradein" as const, coins: p.coins, tier: p.tier };
  });

  return NextResponse.json({
    ok: true,
    packId,
    cards,
    tradeInCoins: tradeInTotal,
    balance: await getBalance(s.user.id),
  });
}
