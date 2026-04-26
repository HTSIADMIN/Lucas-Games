import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getMonopolyState, listMonopolyOwned, upsertMonopolyState } from "@/lib/db";
import { BOARD, BOARD_SIZE, ROLL_COOLDOWN_MS } from "@/lib/games/monopoly/board";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Lazy-create state on first visit.
  let state = await getMonopolyState(s.user.id);
  if (!state) {
    state = await upsertMonopolyState({
      user_id: s.user.id,
      position: 0,
      next_roll_at: null, // ready immediately
      total_rolls: 0,
      total_earned: 0,
      created_at: new Date().toISOString(),
    });
  }

  const owned = await listMonopolyOwned(s.user.id);
  const ownedById: Record<string, { level: number; cards: number }> = {};
  for (const o of owned) {
    ownedById[o.property_id] = { level: o.level, cards: o.card_count };
  }

  const now = Date.now();
  const ready = !state.next_roll_at || new Date(state.next_roll_at).getTime() <= now;

  return NextResponse.json({
    serverNow: now,
    cooldownMs: ROLL_COOLDOWN_MS,
    state: {
      position: state.position,
      nextRollAt: state.next_roll_at,
      totalRolls: state.total_rolls,
      totalEarned: state.total_earned,
      ready,
    },
    board: BOARD,
    boardSize: BOARD_SIZE,
    owned: ownedById,
    balance: await getBalance(s.user.id),
  });
}
