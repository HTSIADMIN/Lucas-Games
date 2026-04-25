import { GameShell } from "@/components/GameShell";
import { BlackjackClient } from "./BlackjackClient";

export default function BlackjackPage() {
  return (
    <GameShell
      title="Blackjack"
      blurb="Beat the dealer to 21. Blackjack pays 3:2. Double down for one card."
    >
      <BlackjackClient />
    </GameShell>
  );
}
