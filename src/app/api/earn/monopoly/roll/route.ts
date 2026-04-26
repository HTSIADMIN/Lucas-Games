import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getMonopolyOwned, getMonopolyState, upsertMonopolyState } from "@/lib/db";
import { BOARD, BOARD_SIZE, ROLL_COOLDOWN_MS, payoutFor } from "@/lib/games/monopoly/board";
import { randInt } from "@/lib/games/rng";

export const runtime = "nodejs";

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getMonopolyState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const now = Date.now();
  if (state.next_roll_at && new Date(state.next_roll_at).getTime() > now) {
    return NextResponse.json(
      { error: "cooldown", nextRollAt: state.next_roll_at },
      { status: 429 },
    );
  }

  const dieA = randInt(1, 6);
  const dieB = randInt(1, 6);
  const move = dieA + dieB;
  const newPos = (state.position + move) % BOARD_SIZE;
  const prop = BOARD[newPos];

  const owned = await getMonopolyOwned(s.user.id, prop.id);
  const level = owned?.level ?? 0;
  const payout = payoutFor(prop, level);

  const refId = `${randomUUID()}:roll`;
  await credit({
    userId: s.user.id,
    amount: payout,
    reason: "monopoly_roll",
    refKind: "monopoly",
    refId,
  });

  const updated = await upsertMonopolyState({
    ...state,
    position: newPos,
    next_roll_at: new Date(now + ROLL_COOLDOWN_MS).toISOString(),
    total_rolls: state.total_rolls + 1,
    total_earned: state.total_earned + payout,
  });

  return NextResponse.json({
    ok: true,
    dice: [dieA, dieB],
    move,
    fromPosition: state.position,
    toPosition: newPos,
    property: prop,
    level,
    payout,
    nextRollAt: updated.next_roll_at,
    balance: await getBalance(s.user.id),
  });
}
