import { NextResponse } from "next/server";
import { randomUUID, randomInt as nodeRandomInt } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";
import { debit, getBalance } from "@/lib/wallet";
import { listInventory } from "@/lib/db";
import { CATALOG, rarityOf, type Rarity } from "@/lib/shop/catalog";

export const runtime = "nodejs";

export const PACK_PRICE = 10_000;
export const PACK_SIZE = 5;

const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
};

function pickWeighted<T>(pool: { item: T; weight: number }[]): T {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = nodeRandomInt(0, Math.max(1, total));
  for (const p of pool) {
    r -= p.weight;
    if (r < 0) return p.item;
  }
  return pool[pool.length - 1].item;
}

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Filter catalog to items the player doesn't own.
  const ownedSet = new Set(await listInventory(s.user.id));
  const candidates = CATALOG.filter((c) => !ownedSet.has(c.id));
  if (candidates.length === 0) {
    return NextResponse.json({ error: "all_owned" }, { status: 409 });
  }

  // Debit pack price.
  try {
    await debit({
      userId: s.user.id,
      amount: PACK_PRICE,
      reason: "shop_pack",
      refKind: "shop_pack",
      refId: `${s.user.id}:pack:${Date.now()}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  // Roll up to PACK_SIZE items without replacement, weighted by rarity.
  const pool = candidates.map((c) => ({ item: c, weight: RARITY_WEIGHT[rarityOf(c.price)] }));
  const rolled: typeof CATALOG = [];
  while (rolled.length < PACK_SIZE && pool.length > 0) {
    const picked = pickWeighted(pool);
    rolled.push(picked);
    const idx = pool.findIndex((p) => p.item.id === picked.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  // Sign a pack token. Embed item ids in the username field — same trick
  // used by the crossy-road / flappy run tokens. Token is single-use; the
  // /choose endpoint marks it redeemed.
  const jti = randomUUID();
  const token = await signSession({
    sub: s.user.id,
    username: `pack:${rolled.map((r) => r.id).join(",")}`,
    jti,
  });

  return NextResponse.json({
    ok: true,
    items: rolled,
    packToken: token,
    balance: await getBalance(s.user.id),
  });
}
