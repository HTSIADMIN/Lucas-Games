import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit } from "@/lib/wallet";
import {
  getUserByUsername,
  insertChatMessage,
} from "@/lib/db";

export const runtime = "nodejs";

const MAX_LEN = 280;

function parseTipCommand(raw: string): { username: string; amount: number } | null {
  // /tip @bobby 5000  OR  /tip bobby 5000
  const m = raw.trim().match(/^\/tip\s+@?(\S+)\s+(\d{1,12})\s*$/i);
  if (!m) return null;
  const amount = Number(m[2]);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) return null;
  return { username: m[1], amount };
}

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { body?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > MAX_LEN) return NextResponse.json({ error: "too_long" }, { status: 400 });

  // /tip command
  const tip = text.startsWith("/tip ") ? parseTipCommand(text) : null;
  if (tip) {
    const target = await getUserByUsername(tip.username);
    if (!target) return NextResponse.json({ error: "no_such_user" }, { status: 404 });
    if (target.id === s.user.id) return NextResponse.json({ error: "no_self_tip" }, { status: 400 });

    const tipId = randomUUID();
    try {
      await debit({
        userId: s.user.id,
        amount: tip.amount,
        reason: "tip_send",
        refKind: "tip",
        refId: `${tipId}:debit`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
    }

    await credit({
      userId: target.id,
      amount: tip.amount,
      reason: "tip_received",
      refKind: "tip",
      refId: `${tipId}:credit`,
    });

    const msg = await insertChatMessage({
      user_id: s.user.id,
      body: `tipped @${target.username} ${tip.amount.toLocaleString()} ¢`,
      kind: "tip",
      ref_kind: "tip",
      ref_id: tipId,
    });
    return NextResponse.json({ ok: true, message: msg, tip: { to: target.username, amount: tip.amount } });
  }

  // /help
  if (text === "/help") {
    return NextResponse.json({
      ok: true,
      help: [
        "/tip @username 1000 — send Coins to a friend",
        "/help — this list",
      ],
    });
  }

  // Plain message
  const msg = await insertChatMessage({
    user_id: s.user.id,
    body: text,
    kind: "message",
    ref_kind: null,
    ref_id: null,
  });
  return NextResponse.json({ ok: true, message: msg });
}
