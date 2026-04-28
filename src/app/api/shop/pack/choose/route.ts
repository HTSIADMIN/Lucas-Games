import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/jwt";
import { credit, getBalance } from "@/lib/wallet";
import { findItem } from "@/lib/shop/catalog";
import { grantItem, ownsItem } from "@/lib/db";
import { PACK_TIERS, isValidPackTier } from "@/lib/shop/packs";

export const runtime = "nodejs";

// Single-use redemption tracker. In-memory — on restart any unused
// token still works once because granting is idempotent (ownsItem
// check below).
const REDEEMED = new Set<string>();

/** Parse the pack token's username field: "pack:<tier>|<id1>,<id2>,…" */
function parsePackPayload(username: string): { tier: string; ids: string[] } | null {
  if (!username.startsWith("pack:")) return null;
  const rest = username.slice("pack:".length);
  const pipe = rest.indexOf("|");
  if (pipe < 0) {
    // Backwards compat — older tokens were "pack:<id1>,<id2>,…" and
    // implicitly used the dust-tier price.
    return { tier: "dust", ids: rest.split(",").filter(Boolean) };
  }
  const tier = rest.slice(0, pipe);
  const ids = rest.slice(pipe + 1).split(",").filter(Boolean);
  return { tier, ids };
}

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

  const parsed = parsePackPayload(payload.username);
  if (!parsed) return NextResponse.json({ error: "wrong_token_kind" }, { status: 400 });
  if (!parsed.ids.includes(body.itemId)) {
    return NextResponse.json({ error: "item_not_in_pack" }, { status: 400 });
  }

  const refundAmount = isValidPackTier(parsed.tier) ? PACK_TIERS[parsed.tier].price : 0;

  const item = findItem(body.itemId);
  if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });

  // If the player somehow already owns the item, mark token redeemed
  // and refund the tier price. Defensive — shouldn't happen because
  // /buy filters owned items out before rolling.
  if (await ownsItem(s.user.id, item.id)) {
    REDEEMED.add(payload.jti);
    if (refundAmount > 0) {
      await credit({
        userId: s.user.id,
        amount: refundAmount,
        reason: "shop_pack_refund",
        refKind: "shop_pack",
        refId: `${payload.jti}:already_owned`,
      });
    }
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
    if (refundAmount > 0) {
      await credit({
        userId: s.user.id,
        amount: refundAmount,
        reason: "shop_pack_refund",
        refKind: "shop_pack",
        refId: `${payload.jti}:grant_failed`,
      }).catch(() => { /* ignore */ });
    }
    return NextResponse.json({ error: msg, refunded: true }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    itemId: item.id,
    balance: await getBalance(s.user.id),
  });
}
