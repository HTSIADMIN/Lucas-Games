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
      blurb="Click coins, buy upgrades, hire helpers. Bank It any time to convert Pinch Cents into wallet ¢."
    >
      <PennyPinchersClient />
    </GameShell>
  );
}
