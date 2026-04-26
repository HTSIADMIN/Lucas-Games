import { GameShell } from "@/components/GameShell";
import { PokerClient } from "./PokerClient";

export default function PokerPage() {
  return (
    <GameShell
      title="The Saloon · Poker"
      game="poker"
      blurb="No-Limit Hold'em · 100/200 blinds · 6 max · 15s action timer"
    >
      <PokerClient />
    </GameShell>
  );
}
