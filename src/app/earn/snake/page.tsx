import { redirect } from "next/navigation";
import { GameShell } from "@/components/GameShell";
import { ArcadeUpgradePanel } from "@/components/arcade/ArcadeUpgradePanel";
import { readSession } from "@/lib/auth/session";
import { SnakeClient } from "./SnakeClient";

export default async function SnakePage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");
  void s; // session validated above; user-id used by client polls.

  return (
    <GameShell
      title="Snake"
      game="snake"
      blurb="Eat the fruit, don't bite yourself. 200 Coins per fruit. Spend wallet ¢ on earn-rate upgrades to boost every payout."
    >
      <SnakeClient />
      <ArcadeUpgradePanel game="snake" />
    </GameShell>
  );
}
