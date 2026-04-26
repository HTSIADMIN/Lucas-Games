import { GameShell } from "@/components/GameShell";
import { CrossyRoadClient } from "./CrossyRoadClient";

export default function CrossyRoadPage() {
  return (
    <GameShell
      title="Crossy Road"
      game="crossy-road"
      blurb="Free to play. 100 Coins per row. Min 1k payout, capped at 10k per run."
    >
      <CrossyRoadClient />
    </GameShell>
  );
}
