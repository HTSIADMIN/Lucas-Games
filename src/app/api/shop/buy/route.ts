import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { findItem } from "@/lib/shop/catalog";
import { debit, getBalance } from "@/lib/wallet";
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

  await grantItem(s.user.id, item.id);

  return NextResponse.json({
    ok: true,
    itemId: item.id,
    balance: await getBalance(s.user.id),
  });
}
