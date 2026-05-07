import { cookies } from "next/headers";
import { SESSION_COOKIE, SessionPayload, verifySession } from "./jwt";
import {
  getSession,
  getUserById,
  revokeSession,
  touchClanMemberLastActive,
  touchSessionLastActive,
} from "@/lib/db";

// Process-local rate limit on the clan-member last-active write.
// Every page hits readSession; without this we'd queue an update
// per request. Bumping every ~60s is plenty granular for the UI.
const LAST_ACTIVE_TOUCH_MS = 60_000;
const lastTouched = new Map<string, number>();

// Same throttle pattern for the session row's last_active_at — used
// to revoke sessions that have been idle for too long. Map is keyed
// by jti rather than user_id so multi-tab users don't share buckets.
const sessionTouched = new Map<string, number>();

// Sessions idle past this window get revoked on the next readSession
// call instead of authenticating. Long enough that a player who
// closes the laptop overnight comes back to a logged-in state, but
// short enough that a forgotten tab can't sit on a live session for
// days. Pairs with the client-side IdleTimeout warn (10 min) — that
// kicks them out long before this fallback fires for an active user.
const SESSION_IDLE_REVOKE_MS = 8 * 60 * 60 * 1000; // 8 hours

export async function readSession(): Promise<{
  payload: SessionPayload;
  user: { id: string; username: string };
} | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  const sess = await getSession(payload.jti);
  if (!sess || sess.revoked) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) return null;
  // Server-side idle check. If the session row's last_active_at is
  // older than the revocation window, kill the session and refuse
  // the request — even if the JWT itself is still inside its 30-day
  // TTL. Backfill: a freshly-migrated row missing last_active_at
  // gets treated as just-active so the deploy doesn't sign anyone
  // out. After the next touch below it'll be set correctly.
  const lastActiveMs = sess.last_active_at
    ? new Date(sess.last_active_at).getTime()
    : new Date(sess.issued_at).getTime();
  if (Date.now() - lastActiveMs > SESSION_IDLE_REVOKE_MS) {
    revokeSession(payload.jti).catch(() => { /* non-fatal — return null below */ });
    return null;
  }
  const user = await getUserById(payload.sub);
  if (!user || !user.is_active) return null;

  const now = Date.now();
  // Throttled touch of clan-member last-active for the member panel.
  const lastClanTouch = lastTouched.get(user.id) ?? 0;
  if (now - lastClanTouch > LAST_ACTIVE_TOUCH_MS) {
    lastTouched.set(user.id, now);
    touchClanMemberLastActive(user.id).catch(() => { /* non-fatal */ });
  }
  // Throttled touch of the session's own last_active_at — keeps the
  // 8h idle clock fresh while the user is genuinely active. Keyed
  // by jti so cross-tab sessions each get their own bucket.
  const lastSessionTouch = sessionTouched.get(payload.jti) ?? 0;
  if (now - lastSessionTouch > LAST_ACTIVE_TOUCH_MS) {
    sessionTouched.set(payload.jti, now);
    touchSessionLastActive(payload.jti).catch(() => { /* non-fatal */ });
  }
  return { payload, user: { id: user.id, username: user.username } };
}
