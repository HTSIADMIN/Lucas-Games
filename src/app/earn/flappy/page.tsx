import { redirect } from "next/navigation";
import { GameShell } from "@/components/GameShell";
import { MiniLeaderboard } from "@/components/MiniLeaderboard";
import { ArcadeUpgradePanel } from "@/components/arcade/ArcadeUpgradePanel";
import { readSession } from "@/lib/auth/session";
import { FlappyClient } from "./FlappyClient";

export default async function FlappyPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  return (
    <GameShell
      title="Flappy"
      game="flappy"
      blurb="Tap or press space to flap. 200 Coins per pipe. Min 1k payout, capped at 10k per run."
    >
      <FlappyClient />
      <ArcadeUpgradePanel game="flappy" />
      <MiniLeaderboard
        endpoint="/api/games/flappy/leaderboard"
        title="Flappy · Top Scores"
        scoreLabel="Best Pipes"
        currentUserId={s.user.id}
      />
    </GameShell>
  );
}
