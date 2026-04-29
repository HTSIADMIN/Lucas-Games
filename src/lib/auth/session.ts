import { cookies } from "next/headers";
import { SESSION_COOKIE, SessionPayload, verifySession } from "./jwt";
import { getSession, getUserById, touchClanMemberLastActive } from "@/lib/db";

// Process-local rate limit on the clan-member last-active write.
// Every page hits readSession; without this we'd queue an update
// per request. Bumping every ~60s is plenty granular for the UI.
const LAST_ACTIVE_TOUCH_MS = 60_000;
const lastTouched = new Map<string, number>();

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
  const user = await getUserById(payload.sub);
  if (!user || !user.is_active) return null;
  // Touch the clan-member last-active timestamp so the member panel
  // can render "active 3h ago" lines. Throttled per-process to avoid
  // a write on every page.
  const now = Date.now();
  const last = lastTouched.get(user.id) ?? 0;
  if (now - last > LAST_ACTIVE_TOUCH_MS) {
    lastTouched.set(user.id, now);
    touchClanMemberLastActive(user.id).catch(() => { /* non-fatal */ });
  }
  return { payload, user: { id: user.id, username: user.username } };
}
