import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { findItem } from "@/lib/shop/catalog";
import { ownsItem, setEquipped } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { itemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const item = body.itemId ? findItem(body.itemId) : undefined;
  if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  if (item.price > 0 && !(await ownsItem(s.user.id, item.id))) {
    return NextResponse.json({ error: "not_owned" }, { status: 403 });
  }

  switch (item.kind) {
    case "avatar_color": {
      const color = (item.meta as { color?: string }).color;
      if (!color) return NextResponse.json({ error: "bad_item_meta" }, { status: 500 });
      await setEquipped(s.user.id, { avatar_color: color });
      break;
    }
    case "frame":
      await setEquipped(s.user.id, { equipped_frame: item.id });
      break;
    case "hat":
      await setEquipped(s.user.id, { equipped_hat: item.id });
      break;
    case "card_deck":
      await setEquipped(s.user.id, { equipped_card_deck: item.id });
      break;
    case "theme":
      await setEquipped(s.user.id, { equipped_theme: item.id });
      break;
    default:
      return NextResponse.json({ error: "kind_invalid" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
