import { SignJWT, jwtVerify } from "jose";

const SECRET_STR =
  process.env.JWT_SECRET ?? "lucas-games-dev-secret-change-me-32bytes-please-yes";
const SECRET = new TextEncoder().encode(SECRET_STR);

export const SESSION_COOKIE = "lg_session";
export const SESSION_TTL_DAYS = 30;

export type SessionPayload = {
  sub: string; // user id
  username: string;
  jti: string;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_DAYS * 24 * 60 * 60;
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setJti(payload.jti)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(SECRET);
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.sub || !payload.jti) return null;
    return {
      sub: payload.sub as string,
      username: (payload.username as string) ?? "",
      jti: payload.jti as string,
    };
  } catch {
    return null;
  }
}
