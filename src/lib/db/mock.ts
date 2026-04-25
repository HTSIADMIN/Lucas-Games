// JSON-file-backed mock DB. Lives at .data/db.json.
// Replaceable with a real Supabase client without touching call sites.
// NOT concurrency-safe — fine for single-machine dev.

import fs from "node:fs";
import path from "node:path";
import {
  CrashBet,
  CrashRound,
  EarnCooldown,
  GameSession,
  MinesGame,
  PinAttempts,
  PlinkoDrop,
  User,
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
  _walletSeq: number;
  _crashBetSeq: number;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const EMPTY: Schema = {
  users: [],
  user_sessions: [],
  pin_attempts: [],
  wallet_transactions: [],
  game_sessions: [],
  earn_cooldowns: [],
  crash_rounds: [],
  crash_bets: [],
  plinko_drops: [],
  mines_games: [],
  _walletSeq: 0,
  _crashBetSeq: 0,
};

function load(): Schema {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY, null, 2));
    return structuredClone(EMPTY);
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Schema>;
    return { ...EMPTY, ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(db: Schema) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Single-process in-memory cache with lazy load + write-through.
let cache: Schema | null = null;
function db(): Schema {
  if (!cache) cache = load();
  return cache;
}
function commit() {
  if (cache) save(cache);
}

// ============ USERS ============
export function listUsersPublic() {
  return db()
    .users.filter((u) => u.is_active)
    .map(({ id, username, avatar_color, initials, last_seen_at }) => ({
      id,
      username,
      avatar_color,
      initials,
      last_seen_at,
    }));
}

export function getUserById(id: string): User | null {
  return db().users.find((u) => u.id === id) ?? null;
}

export function getUserByUsername(username: string): User | null {
  return (
    db().users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ??
    null
  );
}

export function insertUser(input: Omit<User, "created_at" | "last_seen_at" | "is_active">): User {
  const u: User = {
    ...input,
    created_at: new Date().toISOString(),
    last_seen_at: null,
    is_active: true,
  };
  db().users.push(u);
  commit();
  return u;
}

export function touchUserLastSeen(id: string) {
  const u = getUserById(id);
  if (u) {
    u.last_seen_at = new Date().toISOString();
    commit();
  }
}

// ============ SESSIONS ============
export function insertSession(s: UserSession) {
  db().user_sessions.push(s);
  commit();
}
export function getSession(jti: string): UserSession | null {
  return db().user_sessions.find((s) => s.jti === jti) ?? null;
}
export function revokeSession(jti: string) {
  const s = getSession(jti);
  if (s) {
    s.revoked = true;
    commit();
  }
}

// ============ PIN ATTEMPTS ============
export function getPinAttempts(userId: string): PinAttempts | null {
  return db().pin_attempts.find((p) => p.user_id === userId) ?? null;
}
export function bumpPinAttempts(userId: string): PinAttempts {
  const now = new Date();
  const FIFTEEN_MIN = 15 * 60 * 1000;
  let row = getPinAttempts(userId);
  if (!row) {
    row = { user_id: userId, count: 1, window_started_at: now.toISOString() };
    db().pin_attempts.push(row);
  } else {
    const windowStart = new Date(row.window_started_at).getTime();
    if (now.getTime() - windowStart > FIFTEEN_MIN) {
      row.count = 1;
      row.window_started_at = now.toISOString();
    } else {
      row.count += 1;
    }
  }
  commit();
  return row;
}
export function resetPinAttempts(userId: string) {
  const idx = db().pin_attempts.findIndex((p) => p.user_id === userId);
  if (idx >= 0) {
    db().pin_attempts.splice(idx, 1);
    commit();
  }
}

// ============ WALLET ============
export function insertWalletTransaction(
  input: Omit<WalletTransaction, "id" | "created_at">
): WalletTransaction {
  // Idempotency: if ref_kind+ref_id already exists, return existing.
  if (input.ref_kind && input.ref_id) {
    const existing = db().wallet_transactions.find(
      (t) => t.ref_kind === input.ref_kind && t.ref_id === input.ref_id
    );
    if (existing) return existing;
  }
  db()._walletSeq += 1;
  const tx: WalletTransaction = {
    ...input,
    id: db()._walletSeq,
    created_at: new Date().toISOString(),
  };
  db().wallet_transactions.push(tx);
  commit();
  return tx;
}

export function walletBalance(userId: string): number {
  return db()
    .wallet_transactions.filter((t) => t.user_id === userId)
    .reduce((sum, t) => sum + t.delta, 0);
}

export function recentTransactions(userId: string, limit = 20): WalletTransaction[] {
  return db()
    .wallet_transactions.filter((t) => t.user_id === userId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

// ============ GAME SESSIONS ============
export function insertGameSession(
  input: Omit<GameSession, "created_at" | "settled_at">
): GameSession {
  const gs: GameSession = {
    ...input,
    created_at: new Date().toISOString(),
    settled_at: null,
  };
  db().game_sessions.push(gs);
  commit();
  return gs;
}

export function settleGameSession(id: string, payout: number, state?: Record<string, unknown>) {
  const gs = db().game_sessions.find((g) => g.id === id);
  if (!gs) return null;
  gs.status = "settled";
  gs.payout = payout;
  gs.settled_at = new Date().toISOString();
  if (state) gs.state = state;
  commit();
  return gs;
}

export function getGameSession(id: string): GameSession | null {
  return db().game_sessions.find((g) => g.id === id) ?? null;
}

export function updateGameSession(id: string, patch: Partial<GameSession>) {
  const gs = db().game_sessions.find((g) => g.id === id);
  if (!gs) return null;
  Object.assign(gs, patch);
  commit();
  return gs;
}

// ============ EARN COOLDOWNS ============
export function getCooldown(userId: string, kind: string): EarnCooldown | null {
  return (
    db().earn_cooldowns.find((c) => c.user_id === userId && c.kind === kind) ?? null
  );
}

export function setCooldown(userId: string, kind: string, availableAt: Date) {
  const existing = getCooldown(userId, kind);
  if (existing) existing.available_at = availableAt.toISOString();
  else
    db().earn_cooldowns.push({
      user_id: userId,
      kind,
      available_at: availableAt.toISOString(),
    });
  commit();
}

// ============ LEADERBOARD ============
export function leaderboard() {
  const users = db().users.filter((u) => u.is_active);
  const rows = users
    .map((u) => ({
      id: u.id,
      username: u.username,
      avatar_color: u.avatar_color,
      initials: u.initials,
      balance: walletBalance(u.id),
    }))
    .sort((a, b) => b.balance - a.balance)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return rows;
}

// ============ MINES ============
export function insertMinesGame(g: Omit<MinesGame, "created_at" | "ended_at">): MinesGame {
  const row: MinesGame = { ...g, created_at: new Date().toISOString(), ended_at: null };
  db().mines_games.push(row);
  commit();
  return row;
}
export function getMinesGame(id: string): MinesGame | null {
  return db().mines_games.find((m) => m.id === id) ?? null;
}
export function updateMinesGame(id: string, patch: Partial<MinesGame>) {
  const row = db().mines_games.find((m) => m.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  commit();
  return row;
}

// ============ PLINKO ============
export function insertPlinkoDrop(d: Omit<PlinkoDrop, "created_at">): PlinkoDrop {
  const row: PlinkoDrop = { ...d, created_at: new Date().toISOString() };
  db().plinko_drops.push(row);
  commit();
  return row;
}

// ============ DEV: reset (for testing) ============
export function _devReset() {
  cache = structuredClone(EMPTY);
  commit();
}
