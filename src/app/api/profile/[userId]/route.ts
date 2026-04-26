import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db";
import { getBalance } from "@/lib/wallet";
import { levelFromXp, xpFromCoinsWagered } from "@/lib/xp";
import { getChampionId } from "@/lib/champion";

export const runtime = "nodejs";

// Look up user stats. Pass "me" to look up the current user.
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { userId: rawId } = await ctx.params;
  const userId = rawId === "me" ? s.user.id : rawId;
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const useSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  let totalBet = 0;
  let totalWon = 0;
  let biggestWin = 0;
  const byGame: Record<string, { count: number; net: number }> = {};
  let firstSeen: string | null = user.created_at;

  if (useSupabase) {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Wallet aggregates — covers all games (their bet/win deltas land here)
    // including Crash, Plinko, Mines.
    const { data: betsRow } = await supa
      .from("wallet_transactions")
      .select("delta, reason")
      .eq("user_id", userId);
    if (betsRow) {
      for (const r of betsRow as { delta: number; reason: string }[]) {
        const d = Number(r.delta);
        if (d < 0 && (r.reason.endsWith("_bet") || r.reason === "crash_bet")) {
          totalBet += -d;
        }
        if (
          d > 0 &&
          (r.reason.endsWith("_win") ||
            r.reason.endsWith("_cashout") ||
            r.reason.endsWith("_settle") ||
            r.reason === "daily_spin" ||
            r.reason === "crossy_road" ||
            r.reason === "tip_received")
        ) {
          totalWon += d;
          if (d > biggestWin) biggestWin = d;
        }
      }
    }

    // Per-game counts. game_sessions only covers Blackjack / Slots / Roulette / Coin Flip / Dice.
    const { data: gameRows } = await supa
      .from("game_sessions")
      .select("game, bet, payout, status")
      .eq("user_id", userId)
      .eq("status", "settled");
    if (gameRows) {
      for (const r of gameRows as { game: string; bet: number; payout: number }[]) {
        const g = r.game;
        if (!byGame[g]) byGame[g] = { count: 0, net: 0 };
        byGame[g].count++;
        byGame[g].net += Number(r.payout) - Number(r.bet);
      }
    }

    // Crash multiplayer writes to crash_bets, not game_sessions.
    const { data: crashRows } = await supa
      .from("crash_bets")
      .select("bet, payout, cashout_at_x")
      .eq("user_id", userId)
      .not("cashout_at_x", "is", null);
    if (crashRows) {
      for (const r of crashRows as { bet: number; payout: number }[]) {
        if (!byGame.crash) byGame.crash = { count: 0, net: 0 };
        byGame.crash.count++;
        byGame.crash.net += Number(r.payout) - Number(r.bet);
      }
    }

    // Plinko writes to plinko_drops only.
    const { data: plinkoRows } = await supa
      .from("plinko_drops")
      .select("bet, payout")
      .eq("user_id", userId);
    if (plinkoRows) {
      for (const r of plinkoRows as { bet: number; payout: number }[]) {
        if (!byGame.plinko) byGame.plinko = { count: 0, net: 0 };
        byGame.plinko.count++;
        byGame.plinko.net += Number(r.payout) - Number(r.bet);
      }
    }

    // Mines writes to mines_games (count only ended games — not in-progress).
    const { data: minesRows } = await supa
      .from("mines_games")
      .select("bet, payout, status")
      .eq("user_id", userId)
      .neq("status", "active");
    if (minesRows) {
      for (const r of minesRows as { bet: number; payout: number }[]) {
        if (!byGame.mines) byGame.mines = { count: 0, net: 0 };
        byGame.mines.count++;
        byGame.mines.net += Number(r.payout) - Number(r.bet);
      }
    }
  }

  const gamesPlayed = Object.entries(byGame)
    .map(([game, v]) => ({ game, ...v }))
    .sort((a, b) => b.count - a.count);

  const championId = await getChampionId();

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      initials: user.initials,
      memberSince: firstSeen,
      isChampion: user.id === championId,
      equipped: {
        avatarColor: user.avatar_color,
        frame: user.equipped_frame ?? null,
        cardDeck: user.equipped_card_deck ?? "deck_classic",
        theme: user.equipped_theme ?? "saloon",
        hat: user.equipped_hat ?? null,
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
    xp: {
      ...(() => {
        // XP from net wins per game (positive nets only). Mirrors getUserLevel.
        const netWon = gamesPlayed.reduce((s, g) => s + (g.net > 0 ? g.net : 0), 0);
        const xp = xpFromCoinsWagered(netWon);
        const l = levelFromXp(xp);
        return { xp, ...l, totalNetWon: netWon };
      })(),
    },
  });
}
