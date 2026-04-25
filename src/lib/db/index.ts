// Conditional re-export. Picks the data layer at module-load time:
//   NEXT_PUBLIC_SUPABASE_URL set → real Supabase Postgres
//   unset → JSON-file mock at .data/db.json
// Both modules expose the SAME async function signatures.

import * as mockImpl from "./mock";
import * as supabaseImpl from "./supabase";

const useSupabase = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const impl = useSupabase ? supabaseImpl : mockImpl;

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.log(`[db] using ${useSupabase ? "Supabase" : "mock JSON"}`);
}

export const listUsersPublic       = impl.listUsersPublic;
export const getUserById           = impl.getUserById;
export const getUserByUsername     = impl.getUserByUsername;
export const insertUser            = impl.insertUser;
export const touchUserLastSeen     = impl.touchUserLastSeen;

export const insertSession         = impl.insertSession;
export const getSession            = impl.getSession;
export const revokeSession         = impl.revokeSession;

export const getPinAttempts        = impl.getPinAttempts;
export const bumpPinAttempts       = impl.bumpPinAttempts;
export const resetPinAttempts      = impl.resetPinAttempts;

export const insertWalletTransaction = impl.insertWalletTransaction;
export const walletBalance         = impl.walletBalance;
export const recentTransactions    = impl.recentTransactions;

export const insertGameSession     = impl.insertGameSession;
export const settleGameSession     = impl.settleGameSession;
export const getGameSession        = impl.getGameSession;
export const updateGameSession     = impl.updateGameSession;

export const getCooldown           = impl.getCooldown;
export const setCooldown           = impl.setCooldown;

export const leaderboard           = impl.leaderboard;

export const insertMinesGame       = impl.insertMinesGame;
export const getMinesGame          = impl.getMinesGame;
export const updateMinesGame       = impl.updateMinesGame;

export const insertPlinkoDrop      = impl.insertPlinkoDrop;

export const listInventory         = impl.listInventory;
export const ownsItem              = impl.ownsItem;
export const grantItem             = impl.grantItem;
export const setEquipped           = impl.setEquipped;

export * from "./types";
