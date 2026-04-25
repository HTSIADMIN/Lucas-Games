import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { recentTransactions } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    balance: await getBalance(s.user.id),
    transactions: await recentTransactions(s.user.id, 20),
  });
}
