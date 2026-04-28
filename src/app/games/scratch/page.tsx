import { GameShell } from "@/components/GameShell";
import { ScratchClient } from "./ScratchClient";

export default function ScratchPage() {
  return (
    <GameShell
      title="Golden Bounty"
      game="scratch"
      blurb="Scratch the foil. Three-in-a-row pays. Jackpot is rare."
    >
      <ScratchClient />
    </GameShell>
  );
}
