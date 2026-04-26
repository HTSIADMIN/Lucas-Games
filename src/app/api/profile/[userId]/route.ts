import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

// Look up user stats. Pass "me" to look up the current user.
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { userId: rawId } = await ctx.params;
  const userId = rawId === "me" ? s.user.id : rawId;
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Use the supabase client directly for aggregate stats. Fall back to mock for dev.
  const useSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  let totalBet = 0;
  let totalWon = 0;
  let biggestWin = 0;
  let gamesPlayed: { game: string; count: number; net: number }[] = [];
  let firstSeen: string | null = null;

  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Aggregate bet / win totals from the ledger.
    const { data: agg } = await supa.rpc("noop", {}).select(); // no-op fallback
    void agg;

    // Bets: any negative delta excluding shop / tip_send.
    const { data: betsRow } = await supa
      .from("wallet_transactions")
      .select("delta, reason")
      .eq("user_id", userId);
    if (betsRow) {
      for (const r of betsRow as { delta: number; reason: string }[]) {
        const d = Number(r.delta);
        if (d < 0 && (r.reason.endsWith("_bet") || r.reason === "crash_bet")) totalBet += -d;
        if (d > 0 && (r.reason.endsWith("_win") || r.reason.endsWith("_cashout") || r.reason.endsWith("_settle") || r.reason === "daily_spin" || r.reason === "crossy_road" || r.reason === "tip_received")) {
          totalWon += d;
          if (d > biggestWin) biggestWin = d;
        }
      }
    }

    // Games played by game (settled sessions only).
    const { data: gameRows } = await supa
      .from("game_sessions")
      .select("game, bet, payout, status")
      .eq("user_id", userId)
      .eq("status", "settled");
    if (gameRows) {
      const byGame: Record<string, { count: number; net: number }> = {};
      for (const r of gameRows as { game: string; bet: number; payout: number }[]) {
        const g = r.game;
        if (!byGame[g]) byGame[g] = { count: 0, net: 0 };
        byGame[g].count++;
        byGame[g].net += Number(r.payout) - Number(r.bet);
      }
      gamesPlayed = Object.entries(byGame)
        .map(([game, v]) => ({ game, ...v }))
        .sort((a, b) => b.count - a.count);
    }

    firstSeen = user.created_at;
  } else {
    // Mock-DB path
    const { _walletSeq: _ } = await import("@/lib/db/mock") as unknown as { _walletSeq: number };
    void _;
    const dbm = await import("@/lib/db/mock") as unknown as {
      // recentTransactions exists in module scope
    };
    void dbm;
    // Just serve from the index — getBalance covers the rest.
    firstSeen = user.created_at;
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      initials: user.initials,
      memberSince: firstSeen,
      equipped: {
        avatarColor: user.avatar_color,
        frame: user.equipped_frame ?? null,
        cardDeck: user.equipped_card_deck ?? "deck_classic",
        theme: user.equipped_theme ?? "saloon",
      },
    },
    stats: {
      balance: await getBalance(user.id),
      totalBet,
      totalWon,
      net: totalWon - totalBet,
      biggestWin,
      gamesPlayed,
    },
  });
}
