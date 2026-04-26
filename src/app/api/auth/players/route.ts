// Public list of players for the sign-in avatar grid.
// Mirrors `users_public` view (which includes equipped_frame + equipped_hat
// since migration 0016).

import { NextResponse } from "next/server";
import { listUsersPublic } from "@/lib/db";
import { getChampionId } from "@/lib/champion";

export const runtime = "nodejs";

export async function GET() {
  const [players, championId] = await Promise.all([
    listUsersPublic(),
    getChampionId(),
  ]);
  return NextResponse.json({ players, championId });
}
