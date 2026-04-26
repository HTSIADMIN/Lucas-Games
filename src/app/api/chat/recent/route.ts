import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { recentChatMessages } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const messages = await recentChatMessages(50);
  return NextResponse.json({ messages });
}
