import { GameShell } from "@/components/GameShell";
import { SlotsClient } from "./SlotsClient";

export default function SlotsPage() {
  return (
    <GameShell
      title="Boomtown Slots"
      game="slots"
      blurb="5×4 reels, 20 lines. Land 6 cash coins to trigger Round 'Em Up. Buildings on reel 5 multiply the loot. Fill the screen for Boomtown."
    >
      <SlotsClient />
    </GameShell>
  );
}
