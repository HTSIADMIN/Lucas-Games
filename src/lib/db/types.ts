// Mirrors the Supabase schema in supabase/migrations/0001_init.sql etc.
// When the real DB is provisioned, swap the implementation in `mock.ts`
// for a Supabase client — these types stay.

export type User = {
  id: string;
  username: string;
  avatar_color: string;
  initials: string;
  pin_hash: string;
  created_at: string;
  last_seen_at: string | null;
  is_active: boolean;
  equipped_frame?: string | null;
  equipped_card_deck?: string;
  equipped_theme?: string;
};

export type PlayerInventoryRow = {
  user_id: string;
  item_id: string;
  acquired_at: string;
};

export type ChatMessage = {
  id: number;
  user_id: string;
  body: string;
  kind: "message" | "tip" | "system";
  ref_kind: string | null;
  ref_id: string | null;
  created_at: string;
};

export type ChatMessagePublic = ChatMessage & {
  username: string;
  avatar_color: string;
  initials: string;
};

export type UserPublic = Pick<User, "id" | "username" | "avatar_color" | "initials" | "last_seen_at">;

export type UserSession = {
  jti: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  revoked: boolean;
};

export type PinAttempts = {
  user_id: string;
  count: number;
  window_started_at: string;
};

export type WalletTransaction = {
  id: number;
  user_id: string;
  delta: number;
  reason: string;
  ref_kind: string | null;
  ref_id: string | null;
  created_at: string;
};

export type GameSession = {
  id: string;
  user_id: string;
  game: string;
  bet: number;
  payout: number;
  state: Record<string, unknown>;
  status: "open" | "settled" | "void";
  created_at: string;
  settled_at: string | null;
};

export type EarnCooldown = {
  user_id: string;
  kind: string;
  available_at: string;
};

export type LeaderboardRow = {
  id: string;
  username: string;
  avatar_color: string;
  initials: string;
  balance: number;
  rank: number;
};

export type CrashRound = {
  id: string;
  seed: string;
  crash_at_x: number;
  bet_close_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: "betting" | "running" | "crashed" | "pending";
  created_by: string | null;
  round_no: number;
};

export type CrashBet = {
  id: number;
  round_id: string;
  user_id: string;
  bet: number;
  cashout_at_x: number | null;
  payout: number;
  placed_at: string;
  cashed_out_at: string | null;
};

export type PlinkoDrop = {
  id: string;
  user_id: string;
  bet: number;
  rows: number;
  risk: "low" | "med" | "high";
  bucket: number;
  multiplier: number;
  payout: number;
  seed: string;
  created_at: string;
};

export type MinesGame = {
  id: string;
  user_id: string;
  bet: number;
  mine_count: number;
  layout: string;
  revealed: string;
  status: "active" | "busted" | "cashed";
  current_multiplier: number;
  payout: number;
  created_at: string;
  ended_at: string | null;
};
