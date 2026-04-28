// JSON-file-backed mock DB (async interface to mirror Supabase).
// Lives at .data/db.json. NOT concurrency-safe — fine for single-machine dev.
// Used when NEXT_PUBLIC_SUPABASE_URL is unset.

import fs from "node:fs";
import path from "node:path";
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
  PlayerInventoryRow,
  PlinkoDrop,
  SlotRun,
  User,
  UserPublic,
  UserSession,
  WalletTransaction,
} from "./types";

type Schema = {
  users: User[];
  user_sessions: UserSession[];
  pin_attempts: PinAttempts[];
  wallet_transactions: WalletTransaction[];
  game_sessions: GameSession[];
  earn_cooldowns: EarnCooldown[];
  crash_rounds: CrashRound[];
  crash_bets: CrashBet[];
  plinko_drops: PlinkoDrop[];
  mines_games: MinesGame[];
  player_inventory: PlayerInventoryRow[];
  chat_messages: ChatMessage[];
  blackjack_rounds: BlackjackRound[];
  blackjack_seats: BlackjackSeat[];
  coinflip_duels: CoinflipDuel[];
  monopoly_states: MonopolyState[];
  monopoly_owned: MonopolyOwned[];
  slot_runs: SlotRun[];
  _walletSeq: number;
  _crashBetSeq: number;
  _chatSeq: number;
  _bjSeatSeq: number;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const EMPTY: Schema = {
  users: [], user_sessions: [], pin_attempts: [], wallet_transactions: [],
  game_sessions: [], earn_cooldowns: [], crash_rounds: [], crash_bets: [],
  plinko_drops: [], mines_games: [], player_inventory: [], chat_messages: [],
  blackjack_rounds: [], blackjack_seats: [], coinflip_duels: [],
  monopoly_states: [], monopoly_owned: [],
  slot_runs: [],
  _walletSeq: 0, _crashBetSeq: 0, _chatSeq: 0, _bjSeatSeq: 0,
};

function load(): Schema {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY, null, 2));
    return structuredClone(EMPTY);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as Partial<Schema>;
    return { ...EMPTY, ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}
function save(db: Schema) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

type GlobalCache = { lgDb?: Schema };
const g = globalThis as unknown as GlobalCache;
function db(): Schema { if (!g.lgDb) g.lgDb = load(); return g.lgDb; }
function commit() { if (g.lgDb) save(g.lgDb); }

// ============ USERS ============
export async function listUsersPublic(): Promise<UserPublic[]> {
  return db().users.filter((u) => u.is_active).map((u) => ({
    id: u.id,
    username: u.username,
    avatar_color: u.avatar_color,
    initials: u.initials,
    last_seen_at: u.last_seen_at,
    equipped_frame: u.equipped_frame ?? null,
    equipped_hat: u.equipped_hat ?? null,
  }));
}

export async function getUserById(id: string): Promise<User | null> {
  return db().users.find((u) => u.id === id) ?? null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  return db().users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function insertUser(input: Omit<User, "created_at" | "last_seen_at" | "is_active">): Promise<User> {
  const u: User = { ...input, created_at: new Date().toISOString(), last_seen_at: null, is_active: true };
  db().users.push(u); commit(); return u;
}

export async function touchUserLastSeen(id: string): Promise<void> {
  const u = db().users.find((x) => x.id === id);
  if (u) { u.last_seen_at = new Date().toISOString(); commit(); }
}

// ============ SESSIONS ============
export async function insertSession(s: UserSession): Promise<void> {
  db().user_sessions.push(s); commit();
}
export async function getSession(jti: string): Promise<UserSession | null> {
  return db().user_sessions.find((s) => s.jti === jti) ?? null;
}
export async function revokeSession(jti: string): Promise<void> {
  const s = db().user_sessions.find((x) => x.jti === jti);
  if (s) { s.revoked = true; commit(); }
}

// ============ PIN ATTEMPTS ============
export async function getPinAttempts(userId: string): Promise<PinAttempts | null> {
  return db().pin_attempts.find((p) => p.user_id === userId) ?? null;
}
export async function bumpPinAttempts(userId: string): Promise<PinAttempts> {
  const now = new Date();
  const FIFTEEN_MIN = 15 * 60 * 1000;
  let row = db().pin_attempts.find((p) => p.user_id === userId);
  if (!row) {
    row = { user_id: userId, count: 1, window_started_at: now.toISOString() };
    db().pin_attempts.push(row);
  } else if (now.getTime() - new Date(row.window_started_at).getTime() > FIFTEEN_MIN) {
    row.count = 1; row.window_started_at = now.toISOString();
  } else {
    row.count += 1;
  }
  commit(); return row;
}
export async function resetPinAttempts(userId: string): Promise<void> {
  const idx = db().pin_attempts.findIndex((p) => p.user_id === userId);
  if (idx >= 0) { db().pin_attempts.splice(idx, 1); commit(); }
}

// ============ WALLET ============
export async function insertWalletTransaction(
  input: Omit<WalletTransaction, "id" | "created_at">
): Promise<WalletTransaction> {
  if (input.ref_kind && input.ref_id) {
    const existing = db().wallet_transactions.find(
      (t) => t.ref_kind === input.ref_kind && t.ref_id === input.ref_id
    );
    if (existing) return existing;
  }
  db()._walletSeq += 1;
  const tx: WalletTransaction = { ...input, id: db()._walletSeq, created_at: new Date().toISOString() };
  db().wallet_transactions.push(tx);
  commit(); return tx;
}

export async function walletBalance(userId: string): Promise<number> {
  return db().wallet_transactions.filter((t) => t.user_id === userId).reduce((s, t) => s + t.delta, 0);
}

export async function recentTransactions(userId: string, limit = 20): Promise<WalletTransaction[]> {
  return db().wallet_transactions
    .filter((t) => t.user_id === userId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

// ============ GAME SESSIONS ============
export async function insertGameSession(
  input: Omit<GameSession, "created_at" | "settled_at">
): Promise<GameSession> {
  const gs: GameSession = { ...input, created_at: new Date().toISOString(), settled_at: null };
  db().game_sessions.push(gs); commit(); return gs;
}

export async function settleGameSession(
  id: string, payout: number, state?: Record<string, unknown>
): Promise<GameSession | null> {
  const gs = db().game_sessions.find((g) => g.id === id);
  if (!gs) return null;
  gs.status = "settled"; gs.payout = payout; gs.settled_at = new Date().toISOString();
  if (state) gs.state = state;
  commit(); return gs;
}

export async function getGameSession(id: string): Promise<GameSession | null> {
  return db().game_sessions.find((g) => g.id === id) ?? null;
}

export async function updateGameSession(
  id: string, patch: Partial<GameSession>
): Promise<GameSession | null> {
  const gs = db().game_sessions.find((g) => g.id === id);
  if (!gs) return null;
  Object.assign(gs, patch); commit(); return gs;
}

// ============ EARN COOLDOWNS ============
export async function getCooldown(userId: string, kind: string): Promise<EarnCooldown | null> {
  return db().earn_cooldowns.find((c) => c.user_id === userId && c.kind === kind) ?? null;
}
export async function setCooldown(userId: string, kind: string, availableAt: Date): Promise<void> {
  const existing = db().earn_cooldowns.find((c) => c.user_id === userId && c.kind === kind);
  if (existing) existing.available_at = availableAt.toISOString();
  else db().earn_cooldowns.push({ user_id: userId, kind, available_at: availableAt.toISOString() });
  commit();
}

// ============ LEADERBOARD ============
export async function leaderboard() {
  const users = db().users.filter((u) => u.is_active);
  return users
    .map((u) => ({
      id: u.id,
      username: u.username,
      avatar_color: u.avatar_color,
      initials: u.initials,
      equipped_frame: u.equipped_frame ?? null,
      equipped_hat: u.equipped_hat ?? null,
      balance: db().wallet_transactions.filter((t) => t.user_id === u.id).reduce((s, t) => s + t.delta, 0),
    }))
    .sort((a, b) => b.balance - a.balance)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ============ MINES ============
export async function insertMinesGame(
  m: Omit<MinesGame, "created_at" | "ended_at">
): Promise<MinesGame> {
  const row: MinesGame = { ...m, created_at: new Date().toISOString(), ended_at: null };
  db().mines_games.push(row); commit(); return row;
}
export async function getMinesGame(id: string): Promise<MinesGame | null> {
  return db().mines_games.find((m) => m.id === id) ?? null;
}
export async function updateMinesGame(
  id: string, patch: Partial<MinesGame>
): Promise<MinesGame | null> {
  const row = db().mines_games.find((m) => m.id === id);
  if (!row) return null;
  Object.assign(row, patch); commit(); return row;
}

// ============ PLINKO ============
export async function insertPlinkoDrop(
  d: Omit<PlinkoDrop, "created_at">
): Promise<PlinkoDrop> {
  const row: PlinkoDrop = { ...d, created_at: new Date().toISOString() };
  db().plinko_drops.push(row); commit(); return row;
}

// ============ SHOP / INVENTORY ============
export async function listInventory(userId: string): Promise<string[]> {
  return db().player_inventory.filter((r) => r.user_id === userId).map((r) => r.item_id);
}
export async function ownsItem(userId: string, itemId: string): Promise<boolean> {
  return db().player_inventory.some((r) => r.user_id === userId && r.item_id === itemId);
}
export async function grantItem(userId: string, itemId: string): Promise<boolean> {
  if (db().player_inventory.some((r) => r.user_id === userId && r.item_id === itemId)) return false;
  db().player_inventory.push({ user_id: userId, item_id: itemId, acquired_at: new Date().toISOString() });
  commit(); return true;
}
// ============ CRASH (multiplayer rounds) ============
export async function getActiveCrashRound(): Promise<CrashRound | null> {
  // Returns the most recent round in the active lifecycle (betting/running/crashed).
  // Crashed rounds are returned during the post-crash cooldown so the scheduler
  // and clients can show the bust before the next round opens.
  return (
    db().crash_rounds
      .filter((r) => r.status === "betting" || r.status === "running" || r.status === "crashed")
      .sort((a, b) => (b.round_no ?? 0) - (a.round_no ?? 0))[0] ?? null
  );
}

export async function getCrashRound(id: string): Promise<CrashRound | null> {
  return db().crash_rounds.find((r) => r.id === id) ?? null;
}

export async function listRecentCrashRounds(limit = 20): Promise<CrashRound[]> {
  return db().crash_rounds
    .filter((r) => r.status === "crashed" && r.crash_at_x !== null && r.crash_at_x !== undefined)
    .sort((a, b) => (b.round_no ?? 0) - (a.round_no ?? 0))
    .slice(0, limit);
}

export async function insertCrashRound(round: CrashRound): Promise<CrashRound> {
  // Ensure round_no auto-increments
  const max = db().crash_rounds.reduce((m, r) => Math.max(m, r.round_no ?? 0), 0);
  const r = { ...round, round_no: round.round_no || max + 1 };
  db().crash_rounds.push(r);
  commit();
  return r;
}

export async function updateCrashRound(
  id: string,
  patch: Partial<CrashRound>,
): Promise<CrashRound | null> {
  const r = db().crash_rounds.find((x) => x.id === id);
  if (!r) return null;
  Object.assign(r, patch);
  commit();
  return r;
}

export async function listCrashBets(roundId: string): Promise<CrashBet[]> {
  return db().crash_bets.filter((b) => b.round_id === roundId);
}

export async function getCrashBet(roundId: string, userId: string): Promise<CrashBet | null> {
  return db().crash_bets.find((b) => b.round_id === roundId && b.user_id === userId) ?? null;
}

export async function insertCrashBet(input: Omit<CrashBet, "id" | "placed_at" | "cashed_out_at">): Promise<CrashBet> {
  // unique on (round_id, user_id)
  const existing = db().crash_bets.find((b) => b.round_id === input.round_id && b.user_id === input.user_id);
  if (existing) throw new Error("bet_already_placed");
  db()._crashBetSeq += 1;
  const row: CrashBet = {
    ...input,
    id: db()._crashBetSeq,
    placed_at: new Date().toISOString(),
    cashed_out_at: null,
  };
  db().crash_bets.push(row);
  commit();
  return row;
}

export async function updateCrashBet(
  id: number,
  patch: Partial<CrashBet>,
): Promise<CrashBet | null> {
  const row = db().crash_bets.find((b) => b.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  commit();
  return row;
}

export async function listOpenCrashBets(roundId: string): Promise<CrashBet[]> {
  return db().crash_bets.filter((b) => b.round_id === roundId && b.cashout_at_x === null);
}

// ============ MONOPOLY ============
export async function getMonopolyState(userId: string): Promise<MonopolyState | null> {
  return db().monopoly_states.find((s) => s.user_id === userId) ?? null;
}
export async function upsertMonopolyState(state: MonopolyState): Promise<MonopolyState> {
  const idx = db().monopoly_states.findIndex((s) => s.user_id === state.user_id);
  if (idx >= 0) db().monopoly_states[idx] = state;
  else db().monopoly_states.push(state);
  commit();
  return state;
}
export async function listMonopolyOwned(userId: string): Promise<MonopolyOwned[]> {
  return db().monopoly_owned.filter((o) => o.user_id === userId);
}
export async function getMonopolyOwned(userId: string, propertyId: string): Promise<MonopolyOwned | null> {
  return db().monopoly_owned.find((o) => o.user_id === userId && o.property_id === propertyId) ?? null;
}
export async function upsertMonopolyOwned(row: MonopolyOwned): Promise<MonopolyOwned> {
  const idx = db().monopoly_owned.findIndex((o) => o.user_id === row.user_id && o.property_id === row.property_id);
  if (idx >= 0) db().monopoly_owned[idx] = row;
  else db().monopoly_owned.push(row);
  commit();
  return row;
}

// ============ COIN FLIP DUELS ============
export async function listOpenCoinflipDuels(): Promise<CoinflipDuel[]> {
  return db().coinflip_duels
    .filter((d) => d.status === "open")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
export async function listRecentCoinflipDuels(limit = 20): Promise<CoinflipDuel[]> {
  return db().coinflip_duels
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
export async function getCoinflipDuel(id: string): Promise<CoinflipDuel | null> {
  return db().coinflip_duels.find((d) => d.id === id) ?? null;
}
export async function insertCoinflipDuel(duel: CoinflipDuel): Promise<CoinflipDuel> {
  db().coinflip_duels.push(duel); commit(); return duel;
}
export async function updateCoinflipDuel(id: string, patch: Partial<CoinflipDuel>): Promise<CoinflipDuel | null> {
  const d = db().coinflip_duels.find((x) => x.id === id);
  if (!d) return null;
  Object.assign(d, patch); commit(); return d;
}

// ============ BLACKJACK MULTIPLAYER ============
export async function getActiveBlackjackRound(): Promise<BlackjackRound | null> {
  return (
    db().blackjack_rounds
      .filter((r) => r.status !== "settled" || (r.ended_at && Date.now() - new Date(r.ended_at).getTime() < 5000))
      .sort((a, b) => (b.round_no ?? 0) - (a.round_no ?? 0))[0] ?? null
  );
}
export async function getBlackjackRound(id: string): Promise<BlackjackRound | null> {
  return db().blackjack_rounds.find((r) => r.id === id) ?? null;
}
export async function insertBlackjackRound(round: BlackjackRound): Promise<BlackjackRound> {
  const max = db().blackjack_rounds.reduce((m, r) => Math.max(m, r.round_no ?? 0), 0);
  const r = { ...round, round_no: round.round_no || max + 1 };
  db().blackjack_rounds.push(r); commit(); return r;
}
export async function updateBlackjackRound(id: string, patch: Partial<BlackjackRound>): Promise<BlackjackRound | null> {
  const r = db().blackjack_rounds.find((x) => x.id === id);
  if (!r) return null;
  Object.assign(r, patch); commit(); return r;
}
export async function listBlackjackSeats(roundId: string): Promise<BlackjackSeat[]> {
  return db().blackjack_seats.filter((s) => s.round_id === roundId).sort((a, b) => a.id - b.id);
}
export async function getBlackjackSeat(roundId: string, userId: string): Promise<BlackjackSeat | null> {
  return db().blackjack_seats.find((s) => s.round_id === roundId && s.user_id === userId) ?? null;
}
export async function insertBlackjackSeat(input: Omit<BlackjackSeat, "id" | "placed_at">): Promise<BlackjackSeat> {
  if (db().blackjack_seats.some((s) => s.round_id === input.round_id && s.user_id === input.user_id)) {
    throw new Error("seat_already_taken");
  }
  db()._bjSeatSeq += 1;
  const seat: BlackjackSeat = { ...input, id: db()._bjSeatSeq, placed_at: new Date().toISOString() };
  db().blackjack_seats.push(seat); commit(); return seat;
}
export async function updateBlackjackSeat(id: number, patch: Partial<BlackjackSeat>): Promise<BlackjackSeat | null> {
  const s = db().blackjack_seats.find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, patch); commit(); return s;
}

// ============ CHAT ============
export async function insertChatMessage(
  input: Omit<ChatMessage, "id" | "created_at">
): Promise<ChatMessagePublic> {
  db()._chatSeq += 1;
  const msg: ChatMessage = { ...input, id: db()._chatSeq, created_at: new Date().toISOString() };
  db().chat_messages.push(msg);
  commit();
  const u = db().users.find((x) => x.id === input.user_id);
  return {
    ...msg,
    username: u?.username ?? "?",
    avatar_color: u?.avatar_color ?? "var(--gold-300)",
    initials: u?.initials ?? "??",
    equipped_frame: u?.equipped_frame ?? null,
    equipped_hat: u?.equipped_hat ?? null,
  };
}

export async function recentChatMessages(limit = 50): Promise<ChatMessagePublic[]> {
  const all = db().chat_messages.slice().sort((a, b) => b.id - a.id).slice(0, limit);
  return all.reverse().map((m) => {
    const u = db().users.find((x) => x.id === m.user_id);
    return {
      ...m,
      username: u?.username ?? "?",
      avatar_color: u?.avatar_color ?? "var(--gold-300)",
      initials: u?.initials ?? "??",
      equipped_frame: u?.equipped_frame ?? null,
      equipped_hat: u?.equipped_hat ?? null,
    };
  });
}

export async function setEquipped(
  userId: string,
  patch: Partial<Pick<User, "avatar_color" | "equipped_frame" | "equipped_card_deck" | "equipped_theme" | "equipped_hat">>
): Promise<User | null> {
  const u = db().users.find((x) => x.id === userId);
  if (!u) return null;
  if (patch.avatar_color !== undefined) u.avatar_color = patch.avatar_color;
  if (patch.equipped_frame !== undefined) u.equipped_frame = patch.equipped_frame;
  if (patch.equipped_card_deck !== undefined) u.equipped_card_deck = patch.equipped_card_deck;
  if (patch.equipped_theme !== undefined) u.equipped_theme = patch.equipped_theme;
  if (patch.equipped_hat !== undefined) u.equipped_hat = patch.equipped_hat;
  commit(); return u;
}

// ============ SLOTS v2 ============
export async function getSlotsMeter(userId: string): Promise<number> {
  return db().users.find((u) => u.id === userId)?.slots_meter ?? 0;
}

export async function recentSlotsBetAvg(userId: string, limit = 10): Promise<number | null> {
  const rows = db().game_sessions
    .filter((g) => g.user_id === userId && g.game === "slots" && g.status === "settled")
    .filter((g) => (g.state as { kind?: string } | null)?.kind !== "bonus_settle")
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, limit);
  const bets = rows.map((r) => Number(r.bet)).filter((n) => Number.isFinite(n) && n > 0);
  if (bets.length === 0) return null;
  return Math.floor(bets.reduce((s, n) => s + n, 0) / bets.length);
}

export async function setSlotsMeter(userId: string, value: number): Promise<void> {
  const u = db().users.find((x) => x.id === userId);
  if (!u) return;
  u.slots_meter = Math.max(0, Math.floor(value));
  commit();
}

export async function getActiveSlotRun(userId: string): Promise<SlotRun | null> {
  return db().slot_runs.find((r) => r.user_id === userId && r.status === "active") ?? null;
}

export async function insertSlotRun(run: Omit<SlotRun, "created_at" | "ended_at"> & {
  created_at?: string;
  ended_at?: string | null;
}): Promise<SlotRun> {
  const now = new Date().toISOString();
  const full: SlotRun = {
    ...run,
    created_at: run.created_at ?? now,
    ended_at: run.ended_at ?? null,
  };
  db().slot_runs.push(full);
  commit();
  return full;
}

export async function updateSlotRun(id: string, patch: Partial<SlotRun>): Promise<SlotRun | null> {
  const r = db().slot_runs.find((x) => x.id === id);
  if (!r) return null;
  Object.assign(r, patch);
  commit();
  return r;
}
