import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import {
  getMonopolyOwned,
  getMonopolyState,
  upsertMonopolyOwned,
  upsertMonopolyState,
} from "@/lib/db";
import {
  BOARD,
  BOARD_SIZE,
  FREE_PARKING_PAYOUT,
  GO_PAYOUT,
  MYSTERY_DECK,
  PROPERTIES,
  ROLL_COOLDOWN_MS,
  findSpaceWithProperty,
  payoutFor,
  type MysteryCard,
} from "@/lib/games/monopoly/board";
import { randInt } from "@/lib/games/rng";
import { recordChallengeEvent } from "@/lib/challenges/record";

export const runtime = "nodejs";

function pickMysteryCard(): MysteryCard {
  const total = MYSTERY_DECK.reduce((s, e) => s + e.weight, 0);
  let r = randInt(0, total - 1);
  for (const e of MYSTERY_DECK) {
    r -= e.weight;
    if (r < 0) return e.card;
  }
  return MYSTERY_DECK[0].card;
}

export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = session; // local non-nullable for nested closures

  const state = await getMonopolyState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  // Daily-challenge event — fire as soon as the roll is committed.
  recordChallengeEvent(s.user.id, { kind: "use_monopoly_roll" }).catch(() => { /* ignore */ });

  const now = Date.now();
  if (state.next_roll_at && new Date(state.next_roll_at).getTime() > now) {
    return NextResponse.json({ error: "cooldown", nextRollAt: state.next_roll_at }, { status: 429 });
  }

  const dieA = randInt(1, 6);
  const dieB = randInt(1, 6);
  const move = dieA + dieB;
  let pos = (state.position + move) % BOARD_SIZE;

  let totalPayout = 0;
  let earnedFromProperty: { name: string; level: number; payout: number } | null = null;
  let mystery: { card: MysteryCard; effect: string } | null = null;
  let freeReroll = false;

  async function applySpace(idx: number, depth = 0): Promise<void> {
    if (depth > 2) return; // safety cap on chained teleports
    const space = BOARD[idx];

    if (space.kind === "go") {
      totalPayout += GO_PAYOUT;
    } else if (space.kind === "free_parking") {
      totalPayout += FREE_PARKING_PAYOUT;
    } else if (space.kind === "reroll") {
      freeReroll = true;
    } else if (space.kind === "property") {
      const owned = await getMonopolyOwned(s.user.id, space.property.id);
      const level = owned?.level ?? 0;
      const p = payoutFor(space.property, level);
      earnedFromProperty = { name: space.property.name, level, payout: p };
      totalPayout += p;
    } else if (space.kind === "mystery") {
      const card = pickMysteryCard();
      let effect = card.label;
      switch (card.kind) {
        case "coins":
          totalPayout += card.amount;
          break;
        case "pay": {
          const bal = await getBalance(s.user.id);
          const due = Math.min(bal, card.amount);
          if (due > 0) {
            try {
              await debit({
                userId: s.user.id,
                amount: due,
                reason: "monopoly_mystery_pay",
                refKind: "monopoly_mystery",
                refId: `${randomUUID()}:pay`,
              });
            } catch {
              // ignore — friends-only, can't go negative
            }
          }
          totalPayout -= due;
          if (due < card.amount) effect = `${card.label} (you only had ${due.toLocaleString()})`;
          break;
        }
        case "card": {
          const inTier = PROPERTIES.filter((p) => p.tier === card.tier);
          const picked = inTier[randInt(0, inTier.length - 1)];
          const cur = await getMonopolyOwned(s.user.id, picked.id);
          await upsertMonopolyOwned({
            user_id: s.user.id,
            property_id: picked.id,
            level: cur?.level ?? 0,
            card_count: (cur?.card_count ?? 0) + 1,
          });
          effect = `${card.label} → ${picked.name}`;
          break;
        }
        case "goto": {
          const targetIdx = findSpaceWithProperty(card.propertyId);
          if (targetIdx >= 0) {
            pos = targetIdx;
            await applySpace(targetIdx, depth + 1);
          }
          break;
        }
        case "free_roll":
          freeReroll = true;
          break;
      }
      mystery = { card, effect };
    }
  }

  await applySpace(pos);

  if (totalPayout > 0) {
    await credit({
      userId: s.user.id,
      amount: totalPayout,
      reason: "monopoly_roll",
      refKind: "monopoly",
      refId: `${randomUUID()}:roll`,
    });
  }

  const updated = await upsertMonopolyState({
    ...state,
    position: pos,
    next_roll_at: freeReroll ? null : new Date(now + ROLL_COOLDOWN_MS).toISOString(),
    total_rolls: state.total_rolls + 1,
    total_earned: state.total_earned + Math.max(0, totalPayout),
  });

  const space = BOARD[pos];
  return NextResponse.json({
    ok: true,
    dice: [dieA, dieB],
    move,
    fromPosition: state.position,
    toPosition: pos,
    space: {
      kind: space.kind,
      propertyName: space.kind === "property" ? space.property.name : null,
    },
    totalPayout,
    earnedFromProperty,
    mystery,
    freeReroll,
    nextRollAt: updated.next_roll_at,
    balance: await getBalance(s.user.id),
  });
}
