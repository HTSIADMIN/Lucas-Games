import { GameShell } from "@/components/GameShell";
import { SlotsClient } from "./SlotsClient";

export default function SlotsPage() {
  return (
    <GameShell
      title="Slots"
      game="slots"
      blurb="Three reels. Match three sheriffs and walk away rich."
    >
      <SlotsClient />
    </GameShell>
  );
}
