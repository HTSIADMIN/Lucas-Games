import { GameShell } from "@/components/GameShell";
import { DailySpinClient } from "./DailySpinClient";

export default function DailySpinPage() {
  return (
    <GameShell
      title="Daily Spin"
      blurb="Once every 24 hours. Free Coins. Don't waste it."
    >
      <DailySpinClient />
    </GameShell>
  );
}
