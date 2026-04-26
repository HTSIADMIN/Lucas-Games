import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, debit, getBalance } from "@/lib/wallet";
import { getCoinflipDuel, insertGameSession, updateCoinflipDuel } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { randInt } from "@/lib/games/rng";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const duel = await getCoinflipDuel(id);
  if (!duel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (duel.status !== "open") return NextResponse.json({ error: "not_open" }, { status: 400 });
  if (duel.challenger_id === s.user.id) return NextResponse.json({ error: "cant_accept_own" }, { status: 400 });

  // Acceptor pays the matching wager.
  try {
    await debit({
      userId: s.user.id,
      amount: duel.wager,
      reason: "coinflip_duel_escrow",
      refKind: "coinflip_duel",
      refId: `${id}:accept`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  // Server flip — fair 50/50.
  const result: "heads" | "tails" = randInt(0, 1) === 0 ? "heads" : "tails";
  const winnerId = result === duel.challenger_side ? duel.challenger_id : s.user.id;
  const pot = duel.wager * 2;

  await credit({
    userId: winnerId,
    amount: pot,
    reason: "coinflip_duel_win",
    refKind: "coinflip_duel",
    refId: `${id}:settle`,
  });
  await updateCoinflipDuel(id, {
    acceptor_id: s.user.id,
    result,
    winner_id: winnerId,
    status: "resolved",
    resolved_at: new Date().toISOString(),
  });

  // Bets feed: log a settled game_session for both players.
  await insertGameSession({
    id: randomUUID(),
    user_id: duel.challenger_id,
    game: "coinflip_duel",
    bet: duel.wager,
    payout: winnerId === duel.challenger_id ? pot : 0,
    state: { duel_id: id, side: duel.challenger_side, result, opponent_id: s.user.id },
    status: "settled",
  });
  await insertGameSession({
    id: randomUUID(),
    user_id: s.user.id,
    game: "coinflip_duel",
    bet: duel.wager,
    payout: winnerId === s.user.id ? pot : 0,
    state: { duel_id: id, side: duel.challenger_side === "heads" ? "tails" : "heads", result, opponent_id: duel.challenger_id },
    status: "settled",
  });

  // Hydrate challenger + acceptor for the client-side flip overlay.
  let challengerUser: { username: string; avatar_color: string; initials: string } | null = null;
  let acceptorUser: { username: string; avatar_color: string; initials: string } | null = null;
  const useSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supa
      .from("users_public")
      .select("id, username, avatar_color, initials")
      .in("id", [duel.challenger_id, s.user.id]);
    if (data) {
      for (const u of data as Array<{ id: string; username: string; avatar_color: string; initials: string }>) {
        if (u.id === duel.challenger_id) challengerUser = u;
        if (u.id === s.user.id) acceptorUser = u;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    result,
    winnerId,
    youWon: winnerId === s.user.id,
    payout: winnerId === s.user.id ? pot : 0,
    balance: await getBalance(s.user.id),
    duel: {
      id,
      challenger_id: duel.challenger_id,
      challenger_side: duel.challenger_side,
      wager: duel.wager,
      acceptor_id: s.user.id,
      result,
      winner_id: winnerId,
      status: "resolved",
      created_at: duel.created_at,
      resolved_at: new Date().toISOString(),
      challenger: challengerUser,
      acceptor: acceptorUser,
    },
  });
}
