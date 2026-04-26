import { GameShell } from "@/components/GameShell";
import { MonopolyClient } from "./MonopolyClient";

export default function MonopolyPage() {
  return (
    <GameShell
      title="Frontier Monopoly"
      game="monopoly"
      blurb="Roll once an hour. Earn from where you land. Buy card packs to upgrade properties for bigger payouts."
    >
      <MonopolyClient />
    </GameShell>
  );
}
