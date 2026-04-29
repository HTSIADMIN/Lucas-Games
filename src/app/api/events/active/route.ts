import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getActiveEvent } from "@/lib/events/globalEvents";

export const runtime = "nodejs";

// Lightweight read for the global event ticker. Polled by the
// header's <EventTicker> every ~20s; cheap because the engine is
// pure module-state and never hits the DB.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ event: null });
  return NextResponse.json({ event: getActiveEvent() });
}
