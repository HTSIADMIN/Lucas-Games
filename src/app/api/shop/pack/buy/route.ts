import { NextResponse } from "next/server";
import { randomUUID, randomInt as nodeRandomInt } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";
import { debit, getBalance } from "@/lib/wallet";
import { listInventory } from "@/lib/db";
import { CATALOG, isDefaultItem, rarityOf } from "@/lib/shop/catalog";
import { PACK_TIERS, isValidPackTier } from "@/lib/shop/packs";

export const runtime = "nodejs";

function pickWeighted<T>(pool: { item: T; weight: number }[]): T {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = nodeRandomInt(0, Math.max(1, total));
  for (const p of pool) {
    r -= p.weight;
    if (r < 0) return p.item;
  }
  return pool[pool.length - 1].item;
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

  // Roll up to PACK_SIZE items without replacement, weighted by the
  // tier's per-rarity weights. If a tier zeroes out a rarity (e.g.
  // dust → mythic = 0) those items simply never come up.
  const pool = candidates
    .map((c) => ({ item: c, weight: tier.weights[rarityOf(c.price)] }))
    .filter((p) => p.weight > 0);

  // Edge case: tier weights nuked the whole pool (e.g. vault when
  // the player only has commons left). Fall back to *any* unowned
  // item so the pack always returns something playable.
  const effectivePool = pool.length > 0
    ? pool
    : candidates.map((c) => ({ item: c, weight: 1 }));

  const rolled: typeof CATALOG = [];
  const working = effectivePool.slice();
  while (rolled.length < tier.size && working.length > 0) {
    const picked = pickWeighted(working);
    rolled.push(picked);
    const idx = working.findIndex((p) => p.item.id === picked.id);
    if (idx >= 0) working.splice(idx, 1);
  }

  // Sign a single-use pack token. Token carries the tier so /choose
  // can refund the correct amount on failure.
  const jti = randomUUID();
  const token = await signSession({
    sub: s.user.id,
    username: `pack:${tier.id}|${rolled.map((r) => r.id).join(",")}`,
    jti,
  });

  return NextResponse.json({
    ok: true,
    tier: tier.id,
    items: rolled,
    packToken: token,
    balance: await getBalance(s.user.id),
  });
}
