// Supabase adapter — same async signatures as mock.ts.
// Used when NEXT_PUBLIC_SUPABASE_URL is set.
// Always uses the service-role key (server-only). Never imported by client code.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  BlackjackRound,
  BlackjackSeat,
  ChatMessage,
  ChatMessagePublic,
  CoinflipDuel,
  CrashBet,
  CrashRound,
  EarnCooldown,
  GameSession,
  MinesGame,
  MonopolyOwned,
  MonopolyState,
  PinAttempts,
  PlinkoDrop,
  SlotRun,
  User,
  UserPublic,
  UserSession,
  WalletTransaction,
} from "./types";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required).");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${ctx}: null data`);
  return res.data;
}

// ============ USERS ============
export async function listUsersPublic(): Promise<UserPublic[]> {
  const { data, error } = await client()
    .from("users_public")
    .select("id, username, avatar_color, initials, last_seen_at")
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`listUsersPublic: ${error.message}`);
  return (data ?? []) as UserPublic[];
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await client().from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getUserById: ${error.message}`);
  return (data as User | null) ?? null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { data, error } = await client()
    .from("users")
    .select("*")
    .ilike("username", username)
    .maybeSingle();
  if (error) throw new Error(`getUserByUsername: ${error.message}`);
  return (data as User | null) ?? null;
}

export async function insertUser(input: Omit<User, "created_at" | "last_seen_at" | "is_active">): Promise<User> {
  const { data, error } = await client().from("users").insert({
    id: input.id,
    username: input.username,
    avatar_color: input.avatar_color,
    initials: input.initials,
    pin_hash: input.pin_hash,
  }).select("*").single();
  if (error) throw new Error(`insertUser: ${error.message}`);
  return data as User;
}

export async function touchUserLastSeen(id: string): Promise<void> {
  const { error } = await client().from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`touchUserLastSeen: ${error.message}`);
}

// ============ SESSIONS ============
export async function insertSession(s: UserSession): Promise<void> {
  const { error } = await client().from("user_sessions").insert(s);
  if (error) throw new Error(`insertSession: ${error.message}`);
}
export async function getSession(jti: string): Promise<UserSession | null> {
  const { data, error } = await client().from("user_sessions").select("*").eq("jti", jti).maybeSingle();
  if (error) throw new Error(`getSession: ${error.message}`);
  return (data as UserSession | null) ?? null;
}
export async function revokeSession(jti: string): Promise<void> {
  const { error } = await client().from("user_sessions").update({ revoked: true }).eq("jti", jti);
  if (error) throw new Error(`revokeSession: ${error.message}`);
}

// ============ PIN ATTEMPTS ============
export async function getPinAttempts(userId: string): Promise<PinAttempts | null> {
  const { data, error } = await client().from("pin_attempts").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getPinAttempts: ${error.message}`);
  return (data as PinAttempts | null) ?? null;
}
export async function bumpPinAttempts(userId: string): Promise<PinAttempts> {
  const FIFTEEN_MIN = 15 * 60 * 1000;
  const now = new Date();
  const existing = await getPinAttempts(userId);
  let row: PinAttempts;
  if (!existing) {
    row = { user_id: userId, count: 1, window_started_at: now.toISOString() };
    const { error } = await client().from("pin_attempts").insert(row);
    if (error) throw new Error(`bumpPinAttempts insert: ${error.message}`);
  } else if (now.getTime() - new Date(existing.window_started_at).getTime() > FIFTEEN_MIN) {
    row = { user_id: userId, count: 1, window_started_at: now.toISOString() };
    const { error } = await client().from("pin_attempts").update(row).eq("user_id", userId);
    if (error) throw new Error(`bumpPinAttempts reset: ${error.message}`);
  } else {
    row = { ...existing, count: existing.count + 1 };
    const { error } = await client().from("pin_attempts").update({ count: row.count }).eq("user_id", userId);
    if (error) throw new Error(`bumpPinAttempts inc: ${error.message}`);
  }
  return row;
}
export async function resetPinAttempts(userId: string): Promise<void> {
  const { error } = await client().from("pin_attempts").delete().eq("user_id", userId);
  if (error) throw new Error(`resetPinAttempts: ${error.message}`);
}

// ============ WALLET ============
export async function insertWalletTransaction(
  input: Omit<WalletTransaction, "id" | "created_at">
): Promise<WalletTransaction> {
  if (input.ref_kind && input.ref_id) {
    const { data: existing, error: lookupErr } = await client()
      .from("wallet_transactions")
      .select("*")
      .eq("ref_kind", input.ref_kind)
      .eq("ref_id", input.ref_id)
      .maybeSingle();
    if (lookupErr) throw new Error(`insertWalletTransaction lookup: ${lookupErr.message}`);
    if (existing) return existing as WalletTransaction;
  }
  const { data, error } = await client()
    .from("wallet_transactions")
    .insert({
      user_id: input.user_id,
      delta: input.delta,
      reason: input.reason,
      ref_kind: input.ref_kind,
      ref_id: input.ref_id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertWalletTransaction: ${error.message}`);
  return data as WalletTransaction;
}

export async function walletBalance(userId: string): Promise<number> {
  const { data, error } = await client()
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`walletBalance: ${error.message}`);
  return Number((data as { balance?: number | string } | null)?.balance ?? 0);
}

export async function recentTransactions(userId: string, limit = 20): Promise<WalletTransaction[]> {
  const { data, error } = await client()
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recentTransactions: ${error.message}`);
  return (data ?? []) as WalletTransaction[];
}

// ============ GAME SESSIONS ============
export async function insertGameSession(
  input: Omit<GameSession, "created_at" | "settled_at">
): Promise<GameSession> {
  const { data, error } = await client().from("game_sessions").insert({
    id: input.id,
    user_id: input.user_id,
    game: input.game,
    bet: input.bet,
    payout: input.payout,
    state: input.state,
    status: input.status,
  }).select("*").single();
  if (error) throw new Error(`insertGameSession: ${error.message}`);
  return data as GameSession;
}
export async function settleGameSession(
  id: string, payout: number, state?: Record<string, unknown>
): Promise<GameSession | null> {
  const update: Record<string, unknown> = {
    status: "settled",
    payout,
    settled_at: new Date().toISOString(),
  };
  if (state) update.state = state;
  const { data, error } = await client().from("game_sessions").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`settleGameSession: ${error.message}`);
  return (data as GameSession | null) ?? null;
}
export async function getGameSession(id: string): Promise<GameSession | null> {
  const { data, error } = await client().from("game_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getGameSession: ${error.message}`);
  return (data as GameSession | null) ?? null;
}
export async function updateGameSession(
  id: string, patch: Partial<GameSession>
): Promise<GameSession | null> {
  const { data, error } = await client().from("game_sessions").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`updateGameSession: ${error.message}`);
  return (data as GameSession | null) ?? null;
}

// ============ EARN COOLDOWNS ============
export async function getCooldown(userId: string, kind: string): Promise<EarnCooldown | null> {
  const { data, error } = await client()
    .from("earn_cooldowns")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(`getCooldown: ${error.message}`);
  return (data as EarnCooldown | null) ?? null;
}
export async function setCooldown(userId: string, kind: string, availableAt: Date): Promise<void> {
  const { error } = await client()
    .from("earn_cooldowns")
    .upsert({ user_id: userId, kind, available_at: availableAt.toISOString() }, { onConflict: "user_id,kind" });
  if (error) throw new Error(`setCooldown: ${error.message}`);
}

// ============ LEADERBOARD ============
export async function leaderboard() {
  const { data, error } = await client().from("leaderboard").select("*").limit(50);
  if (error) throw new Error(`leaderboard: ${error.message}`);
  // The view returns balance as a string from numeric() in some cases; coerce.
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    username: r.username as string,
    avatar_color: r.avatar_color as string,
    initials: r.initials as string,
    equipped_frame: (r.equipped_frame as string | null | undefined) ?? null,
    equipped_hat: (r.equipped_hat as string | null | undefined) ?? null,
    balance: Number(r.balance ?? 0),
    rank: Number(r.rank ?? 0),
  }));
}

// ============ MINES ============
export async function insertMinesGame(
  m: Omit<MinesGame, "created_at" | "ended_at">
): Promise<MinesGame> {
  const { data, error } = await client().from("mines_games").insert(m).select("*").single();
  if (error) throw new Error(`insertMinesGame: ${error.message}`);
  return data as MinesGame;
}
export async function getMinesGame(id: string): Promise<MinesGame | null> {
  const { data, error } = await client().from("mines_games").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getMinesGame: ${error.message}`);
  return (data as MinesGame | null) ?? null;
}
export async function updateMinesGame(
  id: string, patch: Partial<MinesGame>
): Promise<MinesGame | null> {
  const { data, error } = await client().from("mines_games").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`updateMinesGame: ${error.message}`);
  return (data as MinesGame | null) ?? null;
}

// ============ PLINKO ============
export async function insertPlinkoDrop(
  d: Omit<PlinkoDrop, "created_at">
): Promise<PlinkoDrop> {
  const { data, error } = await client().from("plinko_drops").insert(d).select("*").single();
  if (error) throw new Error(`insertPlinkoDrop: ${error.message}`);
  return data as PlinkoDrop;
}

// ============ SHOP / INVENTORY ============
export async function listInventory(userId: string): Promise<string[]> {
  const { data, error } = await client().from("player_inventory").select("item_id").eq("user_id", userId);
  if (error) throw new Error(`listInventory: ${error.message}`);
  return ((data ?? []) as { item_id: string }[]).map((r) => r.item_id);
}
export async function ownsItem(userId: string, itemId: string): Promise<boolean> {
  const { count, error } = await client()
    .from("player_inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("item_id", itemId);
  if (error) throw new Error(`ownsItem: ${error.message}`);
  return (count ?? 0) > 0;
}
export async function grantItem(userId: string, itemId: string): Promise<boolean> {
  const { error } = await client()
    .from("player_inventory")
    .insert({ user_id: userId, item_id: itemId })
    .select();
  if (error) {
    // 23505 = unique violation = already owned. Return false rather than throw.
    if (error.message.includes("duplicate") || (error as { code?: string }).code === "23505") return false;
    throw new Error(`grantItem: ${error.message}`);
  }
  return true;
}
export async function setEquipped(
  userId: string,
  patch: Partial<Pick<User, "avatar_color" | "equipped_frame" | "equipped_card_deck" | "equipped_theme" | "equipped_hat">>
): Promise<User | null> {
  const update: Record<string, unknown> = {};
  if (patch.avatar_color !== undefined) update.avatar_color = patch.avatar_color;
  if (patch.equipped_frame !== undefined) update.equipped_frame = patch.equipped_frame;
  if (patch.equipped_card_deck !== undefined) update.equipped_card_deck = patch.equipped_card_deck;
  if (patch.equipped_theme !== undefined) update.equipped_theme = patch.equipped_theme;
  if (patch.equipped_hat !== undefined) update.equipped_hat = patch.equipped_hat;
  if (Object.keys(update).length === 0) return await getUserById(userId);
  const { data, error } = await client().from("users").update(update).eq("id", userId).select("*").maybeSingle();
  if (error) throw new Error(`setEquipped: ${error.message}`);
  return (data as User | null) ?? null;
}

// ============ CRASH (multiplayer rounds) ============
export async function getActiveCrashRound(): Promise<CrashRound | null> {
  // Returns the most recent round in the active lifecycle (betting/running/crashed).
  // Crashed rounds are returned during cooldown so the bust UI gets to render.
  const { data, error } = await client()
    .from("crash_rounds")
    .select("*")
    .in("status", ["betting", "running", "crashed"])
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveCrashRound: ${error.message}`);
  return (data as CrashRound | null) ?? null;
}

export async function getCrashRound(id: string): Promise<CrashRound | null> {
  const { data, error } = await client().from("crash_rounds").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getCrashRound: ${error.message}`);
  return (data as CrashRound | null) ?? null;
}

export async function listRecentCrashRounds(limit = 20): Promise<CrashRound[]> {
  const { data, error } = await client()
    .from("crash_rounds")
    .select("*")
    .eq("status", "crashed")
    .order("round_no", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentCrashRounds: ${error.message}`);
  return (data ?? []) as CrashRound[];
}

export async function insertCrashRound(round: CrashRound): Promise<CrashRound> {
  const { data, error } = await client()
    .from("crash_rounds")
    .insert({
      id: round.id,
      seed: round.seed,
      crash_at_x: round.crash_at_x,
      bet_close_at: round.bet_close_at,
      status: round.status,
      created_by: round.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertCrashRound: ${error.message}`);
  return data as CrashRound;
}

export async function updateCrashRound(
  id: string,
  patch: Partial<CrashRound>,
): Promise<CrashRound | null> {
  const { data, error } = await client()
    .from("crash_rounds")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`updateCrashRound: ${error.message}`);
  return (data as CrashRound | null) ?? null;
}

export async function listCrashBets(roundId: string): Promise<CrashBet[]> {
  const { data, error } = await client().from("crash_bets").select("*").eq("round_id", roundId);
  if (error) throw new Error(`listCrashBets: ${error.message}`);
  return (data ?? []) as CrashBet[];
}

export async function getCrashBet(roundId: string, userId: string): Promise<CrashBet | null> {
  const { data, error } = await client()
    .from("crash_bets")
    .select("*")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getCrashBet: ${error.message}`);
  return (data as CrashBet | null) ?? null;
}

export async function insertCrashBet(
  input: Omit<CrashBet, "id" | "placed_at" | "cashed_out_at">,
): Promise<CrashBet> {
  const { data, error } = await client()
    .from("crash_bets")
    .insert({
      round_id: input.round_id,
      user_id: input.user_id,
      bet: input.bet,
      cashout_at_x: input.cashout_at_x,
      payout: input.payout,
    })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505" || error.message.includes("duplicate")) {
      throw new Error("bet_already_placed");
    }
    throw new Error(`insertCrashBet: ${error.message}`);
  }
  return data as CrashBet;
}

export async function updateCrashBet(
  id: number,
  patch: Partial<CrashBet>,
): Promise<CrashBet | null> {
  const { data, error } = await client()
    .from("crash_bets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`updateCrashBet: ${error.message}`);
  return (data as CrashBet | null) ?? null;
}

export async function listOpenCrashBets(roundId: string): Promise<CrashBet[]> {
  const { data, error } = await client()
    .from("crash_bets")
    .select("*")
    .eq("round_id", roundId)
    .is("cashout_at_x", null);
  if (error) throw new Error(`listOpenCrashBets: ${error.message}`);
  return (data ?? []) as CrashBet[];
}

// ============ MONOPOLY ============
export async function getMonopolyState(userId: string): Promise<MonopolyState | null> {
  const { data, error } = await client().from("monopoly_states").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getMonopolyState: ${error.message}`);
  return (data as MonopolyState | null) ?? null;
}
export async function upsertMonopolyState(state: MonopolyState): Promise<MonopolyState> {
  const { data, error } = await client()
    .from("monopoly_states")
    .upsert({
      user_id: state.user_id,
      position: state.position,
      next_roll_at: state.next_roll_at,
      total_rolls: state.total_rolls,
      total_earned: state.total_earned,
    }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertMonopolyState: ${error.message}`);
  return data as MonopolyState;
}
export async function listMonopolyOwned(userId: string): Promise<MonopolyOwned[]> {
  const { data, error } = await client().from("monopoly_owned").select("*").eq("user_id", userId);
  if (error) throw new Error(`listMonopolyOwned: ${error.message}`);
  return (data ?? []) as MonopolyOwned[];
}
export async function getMonopolyOwned(userId: string, propertyId: string): Promise<MonopolyOwned | null> {
  const { data, error } = await client().from("monopoly_owned").select("*").eq("user_id", userId).eq("property_id", propertyId).maybeSingle();
  if (error) throw new Error(`getMonopolyOwned: ${error.message}`);
  return (data as MonopolyOwned | null) ?? null;
}
export async function upsertMonopolyOwned(row: MonopolyOwned): Promise<MonopolyOwned> {
  const { data, error } = await client()
    .from("monopoly_owned")
    .upsert({
      user_id: row.user_id,
      property_id: row.property_id,
      level: row.level,
      card_count: row.card_count,
    }, { onConflict: "user_id,property_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertMonopolyOwned: ${error.message}`);
  return data as MonopolyOwned;
}

// ============ COIN FLIP DUELS ============
export async function listOpenCoinflipDuels(): Promise<CoinflipDuel[]> {
  const { data, error } = await client()
    .from("coinflip_duels")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOpenCoinflipDuels: ${error.message}`);
  return (data ?? []) as CoinflipDuel[];
}
export async function listRecentCoinflipDuels(limit = 20): Promise<CoinflipDuel[]> {
  const { data, error } = await client()
    .from("coinflip_duels")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentCoinflipDuels: ${error.message}`);
  return (data ?? []) as CoinflipDuel[];
}
export async function getCoinflipDuel(id: string): Promise<CoinflipDuel | null> {
  const { data, error } = await client().from("coinflip_duels").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getCoinflipDuel: ${error.message}`);
  return (data as CoinflipDuel | null) ?? null;
}
export async function insertCoinflipDuel(duel: CoinflipDuel): Promise<CoinflipDuel> {
  const { data, error } = await client().from("coinflip_duels").insert({
    id: duel.id,
    challenger_id: duel.challenger_id,
    challenger_side: duel.challenger_side,
    wager: duel.wager,
    status: duel.status,
  }).select("*").single();
  if (error) throw new Error(`insertCoinflipDuel: ${error.message}`);
  return data as CoinflipDuel;
}
export async function updateCoinflipDuel(id: string, patch: Partial<CoinflipDuel>): Promise<CoinflipDuel | null> {
  const { data, error } = await client().from("coinflip_duels").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`updateCoinflipDuel: ${error.message}`);
  return (data as CoinflipDuel | null) ?? null;
}

// ============ BLACKJACK MULTIPLAYER ============
export async function getActiveBlackjackRound(): Promise<BlackjackRound | null> {
  // Return the latest non-settled round, or a recently-settled one within 7s cooldown.
  const cooldownStart = new Date(Date.now() - 5000).toISOString();
  const { data, error } = await client()
    .from("blackjack_rounds")
    .select("*")
    .or(`status.in.(betting,dealing,player_turn,dealer_turn),and(status.eq.settled,ended_at.gte.${cooldownStart})`)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveBlackjackRound: ${error.message}`);
  return (data as BlackjackRound | null) ?? null;
}
export async function getBlackjackRound(id: string): Promise<BlackjackRound | null> {
  const { data, error } = await client().from("blackjack_rounds").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getBlackjackRound: ${error.message}`);
  return (data as BlackjackRound | null) ?? null;
}
export async function insertBlackjackRound(round: BlackjackRound): Promise<BlackjackRound> {
  const { data, error } = await client().from("blackjack_rounds").insert({
    id: round.id, status: round.status, bet_close_at: round.bet_close_at,
    dealer_hand: round.dealer_hand, deck: round.deck,
  }).select("*").single();
  if (error) throw new Error(`insertBlackjackRound: ${error.message}`);
  return data as BlackjackRound;
}
export async function updateBlackjackRound(id: string, patch: Partial<BlackjackRound>): Promise<BlackjackRound | null> {
  const { data, error } = await client().from("blackjack_rounds").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`updateBlackjackRound: ${error.message}`);
  return (data as BlackjackRound | null) ?? null;
}
export async function listBlackjackSeats(roundId: string): Promise<BlackjackSeat[]> {
  const { data, error } = await client().from("blackjack_seats").select("*").eq("round_id", roundId).order("id", { ascending: true });
  if (error) throw new Error(`listBlackjackSeats: ${error.message}`);
  return (data ?? []) as BlackjackSeat[];
}
export async function getBlackjackSeat(roundId: string, userId: string): Promise<BlackjackSeat | null> {
  const { data, error } = await client().from("blackjack_seats").select("*").eq("round_id", roundId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getBlackjackSeat: ${error.message}`);
  return (data as BlackjackSeat | null) ?? null;
}
export async function insertBlackjackSeat(input: Omit<BlackjackSeat, "id" | "placed_at">): Promise<BlackjackSeat> {
  const { data, error } = await client().from("blackjack_seats").insert({
    round_id: input.round_id, user_id: input.user_id, bet: input.bet,
    hand: input.hand, status: input.status, doubled: input.doubled, payout: input.payout,
  }).select("*").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("seat_already_taken");
    throw new Error(`insertBlackjackSeat: ${error.message}`);
  }
  return data as BlackjackSeat;
}
export async function updateBlackjackSeat(id: number, patch: Partial<BlackjackSeat>): Promise<BlackjackSeat | null> {
  const { data, error } = await client().from("blackjack_seats").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(`updateBlackjackSeat: ${error.message}`);
  return (data as BlackjackSeat | null) ?? null;
}

// ============ CHAT ============
export async function insertChatMessage(
  input: Omit<ChatMessage, "id" | "created_at">
): Promise<ChatMessagePublic> {
  const { data: msg, error } = await client()
    .from("chat_messages")
    .insert({
      user_id: input.user_id,
      body: input.body,
      kind: input.kind,
      ref_kind: input.ref_kind,
      ref_id: input.ref_id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertChatMessage: ${error.message}`);
  const u = await getUserById(input.user_id);
  return {
    ...(msg as ChatMessage),
    username: u?.username ?? "?",
    avatar_color: u?.avatar_color ?? "var(--gold-300)",
    initials: u?.initials ?? "??",
  };
}

export async function recentChatMessages(limit = 50): Promise<ChatMessagePublic[]> {
  const { data, error } = await client()
    .from("chat_messages_public")
    .select("*")
    .limit(limit);
  if (error) throw new Error(`recentChatMessages: ${error.message}`);
  // The view returns descending; reverse for chronological in the UI.
  return ((data ?? []) as ChatMessagePublic[]).slice().reverse();
}

// Note: cosmetic_items table is unused by the app — catalog lives in src/lib/shop/catalog.ts.
// If you ever want to move catalog into Postgres, seed the table from CATALOG and read here.

// ============ SLOTS v2 ============
export async function getSlotsMeter(userId: string): Promise<number> {
  const { data, error } = await client()
    .from("users")
    .select("slots_meter")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`getSlotsMeter: ${error.message}`);
  return Number((data as { slots_meter?: number } | null)?.slots_meter ?? 0);
}

export async function setSlotsMeter(userId: string, value: number): Promise<void> {
  const v = Math.max(0, Math.floor(value));
  const { error } = await client().from("users").update({ slots_meter: v }).eq("id", userId);
  if (error) throw new Error(`setSlotsMeter: ${error.message}`);
}

export async function getActiveSlotRun(userId: string): Promise<SlotRun | null> {
  const { data, error } = await client()
    .from("slot_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveSlotRun: ${error.message}`);
  return (data as SlotRun | null) ?? null;
}

export async function insertSlotRun(run: Omit<SlotRun, "created_at" | "ended_at"> & {
  created_at?: string;
  ended_at?: string | null;
}): Promise<SlotRun> {
  const { data, error } = await client()
    .from("slot_runs")
    .insert({
      id: run.id,
      user_id: run.user_id,
      bet: run.bet,
      grid: run.grid,
      respins_left: run.respins_left,
      coins_locked: run.coins_locked,
      building_tier: run.building_tier,
      final_payout: run.final_payout,
      status: run.status,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertSlotRun: ${error.message}`);
  return data as SlotRun;
}

export async function updateSlotRun(id: string, patch: Partial<SlotRun>): Promise<SlotRun | null> {
  const { data, error } = await client()
    .from("slot_runs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`updateSlotRun: ${error.message}`);
  return (data as SlotRun | null) ?? null;
}
