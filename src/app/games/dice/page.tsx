import { GameShell } from "@/components/GameShell";
import { DiceClient } from "./DiceClient";

export default function DicePage() {
  return (
    <GameShell
      title="Dice"
      game="dice"
      blurb="Pick a target. Bet over or under. Server rolls 1–100. Lower chance = bigger payout."
    >
      <DiceClient />
    </GameShell>
  );
}
