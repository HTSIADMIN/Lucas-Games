import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { listMonopolyOwned, upsertMonopolyOwned } from "@/lib/db";
import {
  MAX_LEVEL,
  MAXED_TRADEIN_BY_TIER,
  MONOPOLY_PACKS,
  PROPERTIES,
  UPGRADE_CARDS,
  findProperty,
  type MonopolyPackId,
  type MonopolyPackSpec,
  type PropertyTier,
} from "@/lib/games/monopoly/board";
import { randInt } from "@/lib/games/rng";

export const runtime = "nodejs";

// Total card cost to take a property from level 0 → MAX_LEVEL.
// Used as the "saturation" threshold: any further pulls of an already-
// MAX property are pure duplicates and convert to a coin trade-in.
const FULL_UPGRADE_CARDS = UPGRADE_CARDS.reduce((a, b) => a + b, 0);

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

/** Smart pull. If the random property is already MAX-level, walk up
 *  to higher tiers looking for a non-max property the player can
 *  still upgrade. Falls back to "any non-max", and finally to "give
 *  up and convert to a coin trade-in" if the player has fully maxed
 *  the entire collection. */
function smartPull(
  spec: MonopolyPackSpec,
  ownedLevels: Map<string, number>,
): { propertyId: string | null; tradeInCoins: number; tier: PropertyTier } {
  const initial = rollTierAndProperty(spec);
  const isMax = (id: string) => (ownedLevels.get(id) ?? 0) >= MAX_LEVEL;

  if (!isMax(initial.propertyId)) {
    return { propertyId: initial.propertyId, tradeInCoins: 0, tier: initial.tier };
  }

  // Maxed — bump up tiers (or stay at the top tier of the pack)
  // searching for an unmaxed property. We loop a few tiers above the
  // initial tier; if everything's maxed, sweep across all properties
  // for any non-max regardless of tier; if STILL nothing, trade in.
  for (let t = initial.tier; t <= 5; t++) {
    const candidates = PROPERTIES.filter((p) => p.tier === t && !isMax(p.id));
    if (candidates.length > 0) {
      const c = candidates[randInt(0, candidates.length - 1)];
      return { propertyId: c.id, tradeInCoins: 0, tier: c.tier };
    }
  }
  const anyOpen = PROPERTIES.filter((p) => !isMax(p.id));
  if (anyOpen.length > 0) {
    const c = anyOpen[randInt(0, anyOpen.length - 1)];
    return { propertyId: c.id, tradeInCoins: 0, tier: c.tier };
  }
  // Fully maxed collection — trade in for coins scaled to the tier
  // we WOULD have rolled, so the floor isn't a flat amount.
  return {
    propertyId: null,
    tradeInCoins: MAXED_TRADEIN_BY_TIER[initial.tier],
    tier: initial.tier,
  };
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

  // Snapshot the player's collection so smartPull can dodge maxed
  // properties without a per-card DB round trip.
  const owned = await listMonopolyOwned(s.user.id);
  const ownedLevels = new Map<string, number>(owned.map((o) => [o.property_id, o.level]));

  type Pull =
    | { kind: "card"; propertyId: string }
    | { kind: "tradein"; coins: number; tier: PropertyTier };

  const pulls: Pull[] = [];
  for (let i = 0; i < spec.size; i++) {
    const r = smartPull(spec, ownedLevels);
    if (r.propertyId) {
      pulls.push({ kind: "card", propertyId: r.propertyId });
    } else {
      pulls.push({ kind: "tradein", coins: r.tradeInCoins, tier: r.tier });
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

  void FULL_UPGRADE_CARDS; // reserved for a future "extra cards beyond max" trade-in tier

  return NextResponse.json({
    ok: true,
    packId,
    cards,
    tradeInCoins: tradeInTotal,
    balance: await getBalance(s.user.id),
  });
}
