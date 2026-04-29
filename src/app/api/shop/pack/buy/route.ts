import { NextResponse } from "next/server";
import { randomUUID, randomInt as nodeRandomInt } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";
import { credit, debit, getBalance } from "@/lib/wallet";
import { listInventory } from "@/lib/db";
import { CATALOG, isDefaultItem, rarityOf, type CosmeticItem, type Rarity } from "@/lib/shop/catalog";
import {
  PACK_TIERS,
  RARITY_ORDER,
  isValidPackTier,
  tradeInForSlot,
} from "@/lib/shop/packs";

export const runtime = "nodejs";

function pickRarity(weights: Record<Rarity, number>): Rarity {
  const allowed = RARITY_ORDER.filter((r) => (weights[r] ?? 0) > 0);
  if (allowed.length === 0) return "common";
  const total = allowed.reduce((s, r) => s + weights[r], 0);
  let n = nodeRandomInt(0, Math.max(1, total));
  for (const r of allowed) {
    n -= weights[r];
    if (n < 0) return r;
  }
  return allowed[allowed.length - 1];
}

function pickFromPool(pool: CosmeticItem[]): CosmeticItem {
  return pool[nodeRandomInt(0, pool.length)];
}

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { tier?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const tierId = isValidPackTier(body.tier) ? body.tier : "dust";
  const tier = PACK_TIERS[tierId];

  // Filter the catalog to items the player doesn't own AND aren't
  // marked as default (defaults are implicitly owned by everyone, so
  // we never want them in a pack roll).
  const ownedSet = new Set(await listInventory(s.user.id));
  const candidates = CATALOG.filter((c) => !ownedSet.has(c.id) && !isDefaultItem(c));

  // If the player owns absolutely everything, the buy is a no-op.
  // Refuse the purchase rather than charge them — there's nothing the
  // pack could possibly do.
  if (candidates.length === 0) {
    return NextResponse.json({ error: "all_owned" }, { status: 409 });
  }

  // Charge the tier price.
  try {
    await debit({
      userId: s.user.id,
      amount: tier.price,
      reason: `shop_pack_${tier.id}`,
      refKind: "shop_pack",
      refId: `${s.user.id}:pack:${tier.id}:${Date.now()}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  // Bucket the candidate pool by rarity for fast per-slot lookups.
  const buckets: Record<Rarity, CosmeticItem[]> = {
    common: [], rare: [], epic: [], legendary: [], mythic: [],
  };
  for (const c of candidates) buckets[rarityOf(c.price)].push(c);

  // Build the rolled-rarities the tier *allows*. A pack that zeros
  // out a rarity (e.g. dust → mythic = 0) should never grant items
  // of that rarity, even if everything cheaper is owned. Instead the
  // slot trades in for coins.
  const allowedRarities = RARITY_ORDER.filter((r) => (tier.weights[r] ?? 0) > 0);

  type Pull =
    | { kind: "card"; item: CosmeticItem }
    | { kind: "tradein"; coins: number; rarity: Rarity };

  // Per-slot smart pull: pick a rarity by weight, then walk up
  // through the allowed rarities looking for an unowned item the
  // player can actually use. If no allowed rarity has anything
  // unowned, the slot trades in for coins scaled to the rolled
  // rarity. This keeps cheap packs from accidentally dropping
  // mythics once the lower tiers are saturated.
  const pulls: Pull[] = [];
  for (let slot = 0; slot < tier.size; slot++) {
    const rolledRarity = pickRarity(tier.weights);
    const startIdx = allowedRarities.indexOf(rolledRarity);
    let chosen: CosmeticItem | null = null;
    if (startIdx >= 0) {
      for (let i = startIdx; i < allowedRarities.length; i++) {
        const r = allowedRarities[i];
        if (buckets[r].length === 0) continue;
        chosen = pickFromPool(buckets[r]);
        // Remove from its bucket so subsequent slots in this pack
        // can't roll the same item again.
        buckets[r] = buckets[r].filter((x) => x.id !== chosen!.id);
        break;
      }
    }
    if (chosen) {
      pulls.push({ kind: "card", item: chosen });
    } else {
      pulls.push({
        kind: "tradein",
        coins: tradeInForSlot(tier, rolledRarity),
        rarity: rolledRarity,
      });
    }
  }

  // Credit trade-in coins as a single ledger entry per pack so the
  // wallet history stays clean.
  const tradeInTotal = pulls.reduce((sum, p) => sum + (p.kind === "tradein" ? p.coins : 0), 0);
  if (tradeInTotal > 0) {
    await credit({
      userId: s.user.id,
      amount: tradeInTotal,
      reason: "shop_pack_tradein",
      refKind: "shop_pack",
      refId: `${s.user.id}:pack:${tier.id}:${Date.now()}:tradein`,
    });
  }

  const realItems = pulls.flatMap((p) => (p.kind === "card" ? [p.item] : []));

  // Sign a single-use pack token. Token only carries the real-item
  // IDs; trade-in slots aren't choosable. Token still goes out even
  // when realItems is empty so the client can finish its flow without
  // a second-purchase confusion.
  const jti = randomUUID();
  const token = await signSession({
    sub: s.user.id,
    username: `pack:${tier.id}|${realItems.map((r) => r.id).join(",")}`,
    jti,
  });

  return NextResponse.json({
    ok: true,
    tier: tier.id,
    /** Per-slot pull list — order matches what the overlay reveals.
     *  Each entry is either a `card` (claimable cosmetic) or a
     *  `tradein` (coin bonus already credited). */
    pulls,
    /** Just the cosmetic items, for backwards-compat clients that
     *  still consume `data.items`. New clients prefer `pulls`. */
    items: realItems,
    tradeInCoins: tradeInTotal,
    packToken: token,
    balance: await getBalance(s.user.id),
  });
}
