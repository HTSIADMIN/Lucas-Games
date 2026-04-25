import { GameShell } from "@/components/GameShell";
import { RouletteClient } from "./RouletteClient";

export default function RoulettePage() {
  return (
    <GameShell
      title="Roulette"
      blurb="Single-zero European wheel. Stack bets and let it ride."
    >
      <RouletteClient />
    </GameShell>
  );
}
