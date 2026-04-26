import { GameShell } from "@/components/GameShell";
import { MinesClient } from "./MinesClient";

export default function MinesPage() {
  return (
    <GameShell
      title="Mines"
      game="mines"
      blurb="5×5 grid. Avoid the mines, cash out before greed gets you."
    >
      <MinesClient />
    </GameShell>
  );
}
