import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

const PUBLIC_PATHS = [
  "/sign-in",
  "/api/auth/players",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/me",
];

const PROTECTED_PREFIXES = [
  "/lobby",
  "/games",
  "/leaderboard",
  "/shop",
  "/profile",
  "/api/wallet",
  "/api/games",
  "/api/earn",
  "/api/shop",
  "/api/leaderboard",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();
  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToSignIn(req);
  const payload = await verifySession(token);
  if (!payload) return redirectToSignIn(req);

  // Forward user id for downstream handlers if useful.
  const res = NextResponse.next();
  res.headers.set("x-lg-user-id", payload.sub);
  return res;
}

function redirectToSignIn(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/lobby/:path*",
    "/games/:path*",
    "/leaderboard/:path*",
    "/shop/:path*",
    "/profile/:path*",
    "/api/wallet/:path*",
    "/api/games/:path*",
    "/api/earn/:path*",
    "/api/shop/:path*",
    "/api/leaderboard/:path*",
  ],
};
