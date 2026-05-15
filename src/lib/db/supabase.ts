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
  DailyChallenge,
  EarnCooldown,
  GameSession,
  MinesGame,
  MonopolyOwned,
  MonopolyState,
  PennyPinchersAchievement,
  PennyPinchersHelper,
  PennyPinchersPermUpgrade,
  PennyPinchersState,
  PennyPinchersUpgrade,
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
    .select("id, username, avatar_color, initials, last_seen_at, equipped_frame, equipped_hat")
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
export async function touchSessionLastActive(jti: string): Promise<void> {
  const { error } = await client()
    .from("user_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("jti", jti);
  if (error) throw new Error(`touchSessionLastActive: ${error.message}`);
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
  input: Omit<WalletTransaction, "id" | "created_at" | "delta"> & { delta: number | bigint }
): Promise<WalletTransaction> {
  // The `delta` column is Postgres `numeric` (migration 0041) so
  // PostgREST round-trips it as a string. We accept either `number`
  // or `bigint` from callers; bigint gets serialized as a string
  // for the JSON request body so its precision survives past JS
  // Number.MAX_SAFE_INTEGER. The returned WalletTransaction.delta
  // is downcast to `number` for the API boundary — callers that
  // need exact precision past 9 quadrillion read the ledger
  // differently (e.g. getBalanceExact uses BigInt end-to-end).
  type RawTx = Omit<WalletTransaction, "delta"> & { delta: number | string };
  const toTx = (row: RawTx): WalletTransaction => ({
    ...row,
    delta: Number(row.delta),
  });
  // Bigint serializes via JSON only with a custom replacer; in
  // PostgREST, sending the column as a JSON STRING makes Postgres
  // parse the number itself (numeric column accepts string input).
  // This sidesteps the JS-Number precision wall on the wire.
  const wireDelta: number | string =
    typeof input.delta === "bigint" ? input.delta.toString() : input.delta;
  if (input.ref_kind && input.ref_id) {
    const { data: existing, error: lookupErr } = await client()
      .from("wallet_transactions")
      .select("*")
      .eq("ref_kind", input.ref_kind)
      .eq("ref_id", input.ref_id)
      .maybeSingle();
    if (lookupErr) throw new Error(`insertWalletTransaction lookup: ${lookupErr.message}`);
    if (existing) return toTx(existing as RawTx);
  }
  const { data, error } = await client()
    .from("wallet_transactions")
    .insert({
      user_id: input.user_id,
      delta: wireDelta,
      reason: input.reason,
      ref_kind: input.ref_kind,
      ref_id: input.ref_id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertWalletTransaction: ${error.message}`);
  return toTx(data as RawTx);
}

/** Returns the wallet balance as a JS number. Past 9 quadrillion
 *  the result drifts by 1–64 ¢ vs. the true ledger sum — the
 *  named-tier formatter hides those digits in the UI and callers
 *  that need exact precision (e.g. insufficient-funds checks) use
 *  `walletBalanceExact` for a BigInt round-trip. */
export async function walletBalance(userId: string): Promise<number> {
  const { data, error } = await client()
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`walletBalance: ${error.message}`);
  return Number((data as { balance?: number | string } | null)?.balance ?? 0);
}

/** BigInt-precise wallet balance. The `numeric` column comes back
 *  from PostgREST as a string; parsing through BigInt preserves
 *  the integer exactly regardless of size, so comparisons like
 *  `balance < amount` are reliable past 9 quadrillion. Used by
 *  the debit insufficient-funds gate. */
export async function walletBalanceExact(userId: string): Promise<bigint> {
  const { data, error } = await client()
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`walletBalanceExact: ${error.message}`);
  const raw = (data as { balance?: number | string } | null)?.balance;
  if (raw == null) return BigInt(0);
  // PostgREST returns numeric as string. Strip any decimals
  // defensively (the column is always integer-valued but a future
  // migration might allow fractions).
  const str = String(raw).split(".")[0];
  try { return BigInt(str); }
  catch { return BigInt(0); }
}

export async function recentTransactions(userId: string, limit = 20): Promise<WalletTransaction[]> {
  const { data, error } = await client()
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recentTransactions: ${error.message}`);
  // `delta` is `numeric` on the column (since migration 0041) so
  // PostgREST returns it as a string to preserve precision. Coerce
  // back to `number` at the JS boundary so callers see the same
  // type they always did. Past 9 quadrillion this loses 1–64 ¢
  // precision per row, but the named-tier formatter hides those
  // digits in the UI.
  type RawTx = Omit<WalletTransaction, "delta"> & { delta: number | string };
  return ((data ?? []) as RawTx[]).map((r) => ({
    ...r,
    delta: Number(r.delta),
  }));
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
  patch: Partial<Pick<User,
    "avatar_color" | "equipped_frame" | "equipped_card_deck" |
    "equipped_theme" | "equipped_hat" | "equipped_coin_face"
  >>
): Promise<User | null> {
  const update: Record<string, unknown> = {};
  if (patch.avatar_color !== undefined) update.avatar_color = patch.avatar_color;
  if (patch.equipped_frame !== undefined) update.equipped_frame = patch.equipped_frame;
  if (patch.equipped_card_deck !== undefined) update.equipped_card_deck = patch.equipped_card_deck;
  if (patch.equipped_theme !== undefined) update.equipped_theme = patch.equipped_theme;
  if (patch.equipped_hat !== undefined) update.equipped_hat = patch.equipped_hat;
  if (patch.equipped_coin_face !== undefined) update.equipped_coin_face = patch.equipped_coin_face;
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

// ============ PENNY PINCHERS ============
export async function getPennyPinchersState(userId: string): Promise<PennyPinchersState | null> {
  const { data, error } = await client().from("penny_pinchers_state").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getPennyPinchersState: ${error.message}`);
  return (data as PennyPinchersState | null) ?? null;
}
export async function upsertPennyPinchersState(state: PennyPinchersState): Promise<PennyPinchersState> {
  const { data, error } = await client()
    .from("penny_pinchers_state")
    .upsert({
      user_id: state.user_id,
      cents: state.cents,
      lifetime_clicks: state.lifetime_clicks,
      lifetime_pc_earned: state.lifetime_pc_earned,
      last_tick_at: state.last_tick_at,
      last_bank_at: state.last_bank_at,
      daily_banked_cents: state.daily_banked_cents,
      daily_banked_day: state.daily_banked_day,
      prestige_count: state.prestige_count,
      bank_tokens: state.bank_tokens,
      lifetime_banked_cents: state.lifetime_banked_cents,
      last_prestige_at: state.last_prestige_at,
      frugality: state.frugality,
      album: state.album,
      relics: state.relics,
    }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertPennyPinchersState: ${error.message}`);
  return data as PennyPinchersState;
}
export async function listPennyPinchersPermUpgrades(userId: string): Promise<PennyPinchersPermUpgrade[]> {
  const { data, error } = await client().from("penny_pinchers_perm_upgrades").select("*").eq("user_id", userId);
  if (error) throw new Error(`listPennyPinchersPermUpgrades: ${error.message}`);
  return (data ?? []) as PennyPinchersPermUpgrade[];
}
export async function upsertPennyPinchersPermUpgrade(row: PennyPinchersPermUpgrade): Promise<PennyPinchersPermUpgrade> {
  const { data, error } = await client()
    .from("penny_pinchers_perm_upgrades")
    .upsert({
      user_id: row.user_id,
      upgrade_id: row.upgrade_id,
      level: row.level,
    }, { onConflict: "user_id,upgrade_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertPennyPinchersPermUpgrade: ${error.message}`);
  return data as PennyPinchersPermUpgrade;
}
/** Wipe per-run state — used by the prestige endpoint after computing tokens. */
export async function clearPennyPinchersRun(userId: string): Promise<void> {
  await client().from("penny_pinchers_upgrades").delete().eq("user_id", userId);
  await client().from("penny_pinchers_helpers").delete().eq("user_id", userId);
}

// ============ PENNY PINCHERS — LOCAL-FIRST BLOB ============
// New persistence path for the client-authoritative simulation.
// The blob holds the full game state; the legacy normalized tables
// above stay populated by historical data but are only read once
// per user (by getPennyPinchersBlob) when state_blob is still null.
//
// Returns null only if the row doesn't exist OR if both state_blob
// is null AND there's no legacy data to seed from. The /load route
// then hands back a freshGameState() instead.
export async function getPennyPinchersBlob(userId: string): Promise<{
  blob: Record<string, unknown> | null;
  lastSavedAt: string | null;
}> {
  const { data, error } = await client()
    .from("penny_pinchers_state")
    .select("state_blob, last_saved_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getPennyPinchersBlob: ${error.message}`);
  return {
    blob: (data?.state_blob as Record<string, unknown> | null) ?? null,
    lastSavedAt: (data?.last_saved_at as string | null) ?? null,
  };
}

export async function savePennyPinchersBlob(
  userId: string,
  blob: Record<string, unknown>,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  // Upsert on the existing penny_pinchers_state row. Includes a
  // backstop for the legacy NOT NULL bigint columns from migration
  // 0025 so a brand-new row (no normalized history) can still be
  // inserted. Math.floor every numeric — the helper-tick loop in
  // the client carries fractional PC in memory (perTick = rate/10
  // = e.g. 0.5 per 100 ms), but Postgres rejects a float on bigint
  // ("invalid input syntax for type bigint: '136170859.5'"). The
  // blob itself preserves the float for next load.
  const intOr = (v: unknown, fallback = 0): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback;
  const { error } = await client()
    .from("penny_pinchers_state")
    .upsert(
      {
        user_id: userId,
        state_blob: blob,
        last_saved_at: nowIso,
        cents: intOr(blob.cents),
        lifetime_clicks: intOr(blob.lifetimeClicks),
        lifetime_pc_earned: intOr(blob.lifetimePCEarned),
        prestige_count: intOr(blob.prestigeCount),
        bank_tokens: intOr(blob.bankTokens),
        lifetime_banked_cents: intOr(blob.lifetimeBankedCents),
        frugality: intOr(blob.frugality),
      },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`savePennyPinchersBlob: ${error.message}`);
}
// ============ ARCADE UPGRADES ============
export async function listArcadeUpgrades(
  userId: string,
): Promise<{ user_id: string; game: string; level: number }[]> {
  const { data, error } = await client()
    .from("arcade_upgrades")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`listArcadeUpgrades: ${error.message}`);
  return (data ?? []) as { user_id: string; game: string; level: number }[];
}
export async function getArcadeUpgrade(
  userId: string,
  game: string,
): Promise<{ user_id: string; game: string; level: number } | null> {
  const { data, error } = await client()
    .from("arcade_upgrades")
    .select("*")
    .eq("user_id", userId)
    .eq("game", game)
    .maybeSingle();
  if (error) throw new Error(`getArcadeUpgrade: ${error.message}`);
  return (data as { user_id: string; game: string; level: number } | null) ?? null;
}
export async function setArcadeUpgrade(
  userId: string,
  game: string,
  level: number,
): Promise<void> {
  const { error } = await client()
    .from("arcade_upgrades")
    .upsert({ user_id: userId, game, level }, { onConflict: "user_id,game" });
  if (error) throw new Error(`setArcadeUpgrade: ${error.message}`);
}

export async function listPennyPinchersAchievements(userId: string): Promise<PennyPinchersAchievement[]> {
  const { data, error } = await client().from("penny_pinchers_achievements").select("*").eq("user_id", userId);
  if (error) throw new Error(`listPennyPinchersAchievements: ${error.message}`);
  return (data ?? []) as PennyPinchersAchievement[];
}
export async function insertPennyPinchersAchievements(
  userId: string,
  achievementIds: string[],
): Promise<void> {
  if (achievementIds.length === 0) return;
  const rows = achievementIds.map((id) => ({ user_id: userId, achievement_id: id }));
  // Ignore duplicate-key races — `upsert` with ignoreDuplicates is the
  // safe path. The dedupe in detectNewUnlocks already prevents this in
  // the common case, but two near-simultaneous fetches could double up.
  const { error } = await client()
    .from("penny_pinchers_achievements")
    .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
  if (error) throw new Error(`insertPennyPinchersAchievements: ${error.message}`);
}
export async function listPennyPinchersUpgrades(userId: string): Promise<PennyPinchersUpgrade[]> {
  const { data, error } = await client().from("penny_pinchers_upgrades").select("*").eq("user_id", userId);
  if (error) throw new Error(`listPennyPinchersUpgrades: ${error.message}`);
  return (data ?? []) as PennyPinchersUpgrade[];
}
export async function upsertPennyPinchersUpgrade(row: PennyPinchersUpgrade): Promise<PennyPinchersUpgrade> {
  const { data, error } = await client()
    .from("penny_pinchers_upgrades")
    .upsert({
      user_id: row.user_id,
      upgrade_id: row.upgrade_id,
      level: row.level,
    }, { onConflict: "user_id,upgrade_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertPennyPinchersUpgrade: ${error.message}`);
  return data as PennyPinchersUpgrade;
}
export async function listPennyPinchersHelpers(userId: string): Promise<PennyPinchersHelper[]> {
  const { data, error } = await client().from("penny_pinchers_helpers").select("*").eq("user_id", userId);
  if (error) throw new Error(`listPennyPinchersHelpers: ${error.message}`);
  return (data ?? []) as PennyPinchersHelper[];
}
export async function upsertPennyPinchersHelper(row: PennyPinchersHelper): Promise<PennyPinchersHelper> {
  const { data, error } = await client()
    .from("penny_pinchers_helpers")
    .upsert({
      user_id: row.user_id,
      helper_id: row.helper_id,
      count: row.count,
    }, { onConflict: "user_id,helper_id" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertPennyPinchersHelper: ${error.message}`);
  return data as PennyPinchersHelper;
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

/** Average bet amount across the player's last N slots base spins
 *  (settled sessions only). Used to cap a build-the-meter exploit
 *  where a player spams cheap spins then jumps to a max bet on the
 *  guaranteed-trigger spin. Returns null if there's no history yet. */
export async function recentSlotsBetAvg(userId: string, limit = 10): Promise<number | null> {
  const { data, error } = await client()
    .from("game_sessions")
    .select("bet,state")
    .eq("user_id", userId)
    .eq("game", "slots")
    .eq("status", "settled")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recentSlotsBetAvg: ${error.message}`);
  const rows = (data ?? []) as { bet: number | string; state: { kind?: string } | null }[];
  // Skip bonus-settle rows (state.kind === "bonus_settle") — those carry
  // bet: 0 and would skew the average. Same for any other zero-bet rows.
  const bets = rows
    .filter((r) => (r.state?.kind ?? null) !== "bonus_settle")
    .map((r) => Number(r.bet))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (bets.length === 0) return null;
  return Math.floor(bets.reduce((s, n) => s + n, 0) / bets.length);
}

/** Sums the wallet-ledger deltas for the two reasons that move the
 *  Boomtown jackpot pool. A bet is a negative delta; a payout is a
 *  positive one. The pool grows by `-sum(bet deltas)` and shrinks by
 *  `+sum(payout deltas)`, so the live pool value equals
 *  `STARTING_POOL - (sum of both reasons' deltas)`. We do this on
 *  read instead of holding a counter because module-level state is
 *  reset on every cold start in serverless.
 *
 *  Pulls the sum via a server-side Postgres function so we get the
 *  true total instead of the first-1000-rows partial that PostgREST
 *  returns by default. The function is `slots_jackpot_ledger_sum`
 *  defined in migration 0024.
 */
export async function slotsJackpotLedgerSum(): Promise<number> {
  const { data, error } = await client().rpc("slots_jackpot_ledger_sum");
  if (error) throw new Error(`slotsJackpotLedgerSum: ${error.message}`);
  return Number(data ?? 0);
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

// ============ DAILY CHALLENGES ============

export async function listDailyChallenges(userId: string, day: string): Promise<DailyChallenge[]> {
  const { data, error } = await client()
    .from("daily_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("day", day)
    .order("slot", { ascending: true });
  if (error) throw new Error(`listDailyChallenges: ${error.message}`);
  return (data ?? []) as DailyChallenge[];
}

export async function insertDailyChallenges(rows: DailyChallenge[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client().from("daily_challenges").insert(rows);
  if (error) throw new Error(`insertDailyChallenges: ${error.message}`);
}

/** Bump progress on a single (user, day, slot). Returns the row
 *  after the update so callers can detect newly-completed challenges
 *  without an extra round trip. */
export async function bumpDailyChallengeProgress(
  userId: string, day: string, slot: number, delta: number,
): Promise<DailyChallenge | null> {
  const { data: row } = await client()
    .from("daily_challenges")
    .select("*")
    .eq("user_id", userId).eq("day", day).eq("slot", slot)
    .maybeSingle();
  if (!row) return null;
  const cur = row as DailyChallenge;
  if (cur.completed_at) return cur;
  const nextProgress = Math.min(cur.goal, cur.progress + delta);
  const completed = nextProgress >= cur.goal && !cur.completed_at;
  const { data, error } = await client()
    .from("daily_challenges")
    .update({
      progress: nextProgress,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("user_id", userId).eq("day", day).eq("slot", slot)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`bumpDailyChallengeProgress: ${error.message}`);
  return (data as DailyChallenge | null) ?? null;
}

/** Mark the challenge as claimed once the player taps the reward
 *  button. Returns the updated row (or null if it was already claimed
 *  / not eligible). */
export async function markDailyChallengeClaimed(
  userId: string, day: string, slot: number,
): Promise<DailyChallenge | null> {
  const { data, error } = await client()
    .from("daily_challenges")
    .update({ claimed_at: new Date().toISOString() })
    .eq("user_id", userId).eq("day", day).eq("slot", slot)
    .is("claimed_at", null)
    .not("completed_at", "is", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`markDailyChallengeClaimed: ${error.message}`);
  return (data as DailyChallenge | null) ?? null;
}

// ============ CLAN MEMBER LAST-ACTIVE ============
// Touched from readSession on every authenticated request so the
// member panel can show "active 3h ago".
export async function touchClanMemberLastActive(userId: string): Promise<void> {
  const { error } = await client()
    .from("clan_members")
    .update({ last_active_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    // Non-fatal — log but don't fail the request.
    // eslint-disable-next-line no-console
    console.warn(`touchClanMemberLastActive: ${error.message}`);
  }
}
