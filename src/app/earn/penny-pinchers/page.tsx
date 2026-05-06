import { redirect } from "next/navigation";
import { GameShell } from "@/components/GameShell";
import { readSession } from "@/lib/auth/session";
import { PennyPinchersClient } from "./PennyPinchersClient";

export default async function PennyPinchersPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  return (
    <GameShell
      title="Penny Pinchers"
      game="penny-pinchers"
      blurb="Coming soon — a new free way to scrape together a few extra coins."
    >
      <PennyPinchersClient />
    </GameShell>
  );
}
