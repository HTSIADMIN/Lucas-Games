import { GameShell } from "@/components/GameShell";
import { CoinFlipClient } from "./CoinFlipClient";

export default function CoinFlipPage() {
  return (
    <GameShell title="Coin Flip" game="coinflip" blurb="Heads or tails. 49.5% to win, pays 2x.">
      <CoinFlipClient />
    </GameShell>
  );
}
