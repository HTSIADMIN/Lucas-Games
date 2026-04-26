import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { findItem } from "@/lib/shop/catalog";
import { credit, debit, getBalance } from "@/lib/wallet";
import { grantItem, ownsItem } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { itemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const item = body.itemId ? findItem(body.itemId) : undefined;
  if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });

  if (await ownsItem(s.user.id, item.id)) {
    return NextResponse.json({ error: "already_owned" }, { status: 409 });
  }

  // Debit first.
  if (item.price > 0) {
    try {
      await debit({
        userId: s.user.id,
        amount: item.price,
        reason: "shop_purchase",
        refKind: "shop",
        refId: `${s.user.id}:${item.id}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
    }
  }

  // Grant the item. If this fails for any reason, refund the wallet so the
  // player isn't left holding a debit with no item — that's the bug
  // migration 0015 was created for. Defense in depth.
  try {
    await grantItem(s.user.id, item.id);
  } catch (err) {
    if (item.price > 0) {
      await credit({
        userId: s.user.id,
        amount: item.price,
        reason: "shop_purchase_refund",
        refKind: "shop",
        refId: `${s.user.id}:${item.id}:refund`,
      });
    }
    const msg = err instanceof Error ? err.message : "grant_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    itemId: item.id,
    balance: await getBalance(s.user.id),
  });
}
