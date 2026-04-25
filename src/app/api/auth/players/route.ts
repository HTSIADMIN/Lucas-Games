// Public list of players for the sign-in avatar grid.
// Mirrors `users_public` view in 0001_init.sql.

import { NextResponse } from "next/server";
import { listUsersPublic } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ players: await listUsersPublic() });
}
