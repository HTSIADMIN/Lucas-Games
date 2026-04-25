import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { CATALOG } from "@/lib/shop/catalog";
import { listInventory } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const owned = new Set(listInventory(s.user.id));
  return NextResponse.json({
    items: CATALOG.map((c) => ({ ...c, owned: owned.has(c.id) })),
  });
}
