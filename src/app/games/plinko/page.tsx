import { GameShell } from "@/components/GameShell";
import { PlinkoClient } from "./PlinkoClient";

export default function PlinkoPage() {
  return (
    <GameShell
      title="Plinko"
      game="plinko"
      blurb="Drop a chip. Pegs do the rest. Outer buckets pay big."
    >
      <PlinkoClient />
    </GameShell>
  );
}
