import { cookies } from "next/headers";
import { SESSION_COOKIE, SessionPayload, verifySession } from "./jwt";
import { getSession, getUserById } from "@/lib/db";

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
  return { payload, user: { id: user.id, username: user.username } };
}
