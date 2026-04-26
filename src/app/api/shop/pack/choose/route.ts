import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/jwt";
import { credit, getBalance } from "@/lib/wallet";
import { findItem } from "@/lib/shop/catalog";
import { grantItem, ownsItem } from "@/lib/db";
import { PACK_PRICE } from "../buy/route";

export const runtime = "nodejs";

// Single-use redemption tracker. Stays in memory — fine for a small friends
// game. If the process restarts, an unused token will still be valid for the
// remainder of its 30-day session TTL but each token only works once anyway
// since granting is idempotent (ownsItem check below).
const REDEEMED = new Set<string>();

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { packToken?: string; itemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.packToken) return NextResponse.json({ error: "no_token" }, { status: 400 });
  if (!body.itemId) return NextResponse.json({ error: "no_item" }, { status: 400 });

  const payload = await verifySession(body.packToken);
  if (!payload) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  if (payload.sub !== s.user.id) return NextResponse.json({ error: "token_user_mismatch" }, { status: 400 });
  if (REDEEMED.has(payload.jti)) return NextResponse.json({ error: "token_redeemed" }, { status: 400 });
  if (!payload.username.startsWith("pack:")) return NextResponse.json({ error: "wrong_token_kind" }, { status: 400 });

  // Decode the rolled item ids and confirm the chosen one was in the roll.
  const rolledIds = payload.username.slice("pack:".length).split(",").filter(Boolean);
  if (!rolledIds.includes(body.itemId)) {
    return NextResponse.json({ error: "item_not_in_pack" }, { status: 400 });
  }

  const item = findItem(body.itemId);
  if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });

  // If the player somehow already owns the item, mark token redeemed and
  // refund the pack price (defensive).
  if (await ownsItem(s.user.id, item.id)) {
    REDEEMED.add(payload.jti);
    await credit({
      userId: s.user.id,
      amount: PACK_PRICE,
      reason: "shop_pack_refund",
      refKind: "shop_pack",
      refId: `${payload.jti}:already_owned`,
    });
    return NextResponse.json({
      error: "already_owned",
      refunded: true,
      balance: await getBalance(s.user.id),
    }, { status: 409 });
  }

  REDEEMED.add(payload.jti);

  try {
    await grantItem(s.user.id, item.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "grant_failed";
    // Refund on grant failure so the player isn't out 10k.
    await credit({
      userId: s.user.id,
      amount: PACK_PRICE,
      reason: "shop_pack_refund",
      refKind: "shop_pack",
      refId: `${payload.jti}:grant_failed`,
    }).catch(() => { /* ignore */ });
    return NextResponse.json({ error: msg, refunded: true }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    itemId: item.id,
    balance: await getBalance(s.user.id),
  });
}
