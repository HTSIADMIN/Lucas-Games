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
  equipped_hat?: string | null;
  slots_meter?: number;
  bonus_spin_tokens?: number;
};

// ============ CLANS ============
export type ClanAnimal =
  | "wolf" | "bear" | "eagle" | "snake" | "bull" | "coyote" | "hawk" | "stag";

export type Clan = {
  id: string;
  name: string;
  tag: string;
  animal_icon: ClanAnimal;
  founder_id: string;
  member_count: number;
  total_xp_week: number;
  created_at: string;
};

export type ClanMember = {
  clan_id: string;
  user_id: string;
  role: "leader" | "member";
  weekly_xp: number;
  joined_at: string;
};

export type ClanSeason = {
  id: string;
  week_start: string;
  week_end: string;
  status: "active" | "settled";
  created_at: string;
};

export type ClanChestTier = "rare" | "epic" | "legendary";

export type ClanChestRewards = {
  coins?: number;
  monopolyCards?: { propertyId: string; count: number }[];
  spinTokens?: number;
};

export type ClanChest = {
  id: string;
  user_id: string;
  season_id: string;
  rank: number;
  tier: ClanChestTier;
  opened_at: string | null;
  rewards: ClanChestRewards | null;
  created_at: string;
};

// Hold-and-spin bonus session state. One row per active bonus.
export type SlotRun = {
  id: string;
  user_id: string;
  bet: number;
  grid: SlotCell[];          // length-20: 5 reels × 4 rows, row-major
  respins_left: number;
  coins_locked: number;
  building_tier: number;     // 1..5
  final_payout: number | null;
  status: "active" | "settled";
  created_at: string;
  ended_at: string | null;
};

export type SlotCell = {
  value: number | null;      // null = blank, otherwise locked cash-coin value (¢)
  locked: boolean;
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
  equipped_frame?: string | null;
  equipped_hat?: string | null;
};

export type BlackjackRound = {
  id: string;
  round_no: number;
  status: "betting" | "dealing" | "player_turn" | "dealer_turn" | "settled";
  bet_close_at: string | null;
  action_deadline_at: string | null;
  current_user_id: string | null;
  dealer_hand: { rank: string; suit: string }[];
  deck: { rank: string; suit: string }[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type BlackjackSeat = {
  id: number;
  round_id: string;
  user_id: string;
  bet: number;
  hand: { rank: string; suit: string }[];
  status: "waiting" | "playing" | "standing" | "busted" | "blackjack" | "done";
  doubled: boolean;
  payout: number;
  placed_at: string;
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
  equipped_frame?: string | null;
  equipped_hat?: string | null;
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

export type MonopolyState = {
  user_id: string;
  position: number;
  next_roll_at: string | null;
  total_rolls: number;
  total_earned: number;
  created_at: string;
};

export type MonopolyOwned = {
  user_id: string;
  property_id: string;
  level: number;
  card_count: number;
};

export type CoinflipDuel = {
  id: string;
  challenger_id: string;
  challenger_side: "heads" | "tails";
  wager: number;
  acceptor_id: string | null;
  result: "heads" | "tails" | null;
  winner_id: string | null;
  status: "open" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
};
