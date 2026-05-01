import { redirect } from "next/navigation";
import { GameShell } from "@/components/GameShell";
import { readSession } from "@/lib/auth/session";
import { SnakeClient } from "./SnakeClient";

export default async function SnakePage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  return (
    <GameShell
      title="Snake"
      game="snake"
      blurb="Eat the fruit, don't bite yourself. 200 Coins per fruit. Min 1k payout, capped at 50k per run."
    >
      <SnakeClient />
    </GameShell>
  );
}
