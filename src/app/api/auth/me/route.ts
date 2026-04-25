import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: { id: s.user.id, username: s.user.username },
    balance: getBalance(s.user.id),
  });
}
