import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { upsertMonopolyOwned, getMonopolyOwned } from "@/lib/db";
import {
  clansEnabled,
  getChest,
  grantBonusSpinTokens,
  openChest,
} from "@/lib/clans/db";
import { rollChestRewards } from "@/lib/clans/rewards";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;

  // Confirm the chest exists, belongs to me, and is unopened.
  const existing = await getChest(s.user.id, id);
  if (!existing) return NextResponse.json({ error: "chest_not_found" }, { status: 404 });
  if (existing.opened_at) return NextResponse.json({ error: "already_opened" }, { status: 409 });

  const rewards = rollChestRewards(existing.tier);
  const opened = await openChest({ userId: s.user.id, chestId: id, rewards });
  if (!opened) return NextResponse.json({ error: "open_race" }, { status: 409 });

  // Apply rewards
  if (rewards.coins && rewards.coins > 0) {
    await credit({
      userId: s.user.id,
      amount: rewards.coins,
      reason: "clan_chest",
      refKind: "clan_chest",
      refId: id,
    });
  }
  if (rewards.spinTokens && rewards.spinTokens > 0) {
    await grantBonusSpinTokens(s.user.id, rewards.spinTokens);
  }
  if (rewards.monopolyCards && rewards.monopolyCards.length > 0) {
    for (const card of rewards.monopolyCards) {
      const existingOwn = await getMonopolyOwned(s.user.id, card.propertyId);
      await upsertMonopolyOwned({
        user_id: s.user.id,
        property_id: card.propertyId,
        level: existingOwn?.level ?? 0,
        card_count: (existingOwn?.card_count ?? 0) + card.count,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    chest: opened,
    balance: await getBalance(s.user.id),
  });
}
