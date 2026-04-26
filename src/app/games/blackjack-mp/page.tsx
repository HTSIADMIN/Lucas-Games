import { GameShell } from "@/components/GameShell";
import { BlackjackMpClient } from "./BlackjackMpClient";

export default function BlackjackMpPage() {
  return (
    <GameShell
      title="Blackjack Table"
      game="blackjack"
      blurb="15s to buy in. 15s per action. Beat the dealer with everyone watching."
    >
      <BlackjackMpClient />
    </GameShell>
  );
}
