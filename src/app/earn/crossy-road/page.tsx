import { redirect } from "next/navigation";
import { GameShell } from "@/components/GameShell";
import { MiniLeaderboard } from "@/components/MiniLeaderboard";
import { ArcadeUpgradePanel } from "@/components/arcade/ArcadeUpgradePanel";
import { readSession } from "@/lib/auth/session";
import { CrossyRoadClient } from "./CrossyRoadClient";

export default async function CrossyRoadPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  return (
    <GameShell
      title="Crossy Road"
      game="crossy-road"
      blurb="Free to play. 100 Coins per row. Spend wallet ¢ on earn-rate upgrades to boost every payout."
    >
      <CrossyRoadClient />
      <ArcadeUpgradePanel game="crossy_road" />
      <MiniLeaderboard
        endpoint="/api/games/crossy/leaderboard"
        title="Crossy Road · Top Scores"
        scoreLabel="Best Rows"
        currentUserId={s.user.id}
      />
    </GameShell>
  );
}
