import { GameShell } from "@/components/GameShell";
import { CrashClient } from "./CrashClient";

export default function CrashPage() {
  return (
    <GameShell
      title="Crash"
      blurb="Multiplier rises. Cash out before the bust. Server holds the crash point — no peeking."
    >
      <CrashClient />
    </GameShell>
  );
}
