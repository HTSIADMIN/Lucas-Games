import { GameShell } from "@/components/GameShell";
import { CoinflipDuelClient } from "./CoinflipDuelClient";

export default function CoinflipDuelPage() {
  return (
    <GameShell
      title="Coin Flip Duels"
      game="coinflip-duel"
      blurb="Pick your side, set a wager. First friend to accept takes the other side. Winner takes the pot."
    >
      <CoinflipDuelClient />
    </GameShell>
  );
}
