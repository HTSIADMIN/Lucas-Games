import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { AppLive } from "@/components/social/AppLive";
import { readSession } from "@/lib/auth/session";
import { getUserById, leaderboard, recentChatMessages } from "@/lib/db";
import { getChampionId } from "@/lib/champion";
import { LeaderboardClient } from "./LeaderboardClient";

export default async function LeaderboardPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  const user = (await getUserById(s.user.id))!;
  const rows = (await leaderboard()).slice(0, 50);
  const initialChat = await recentChatMessages(50);
  const championId = await getChampionId();
  const me = {
    id: user.id,
    username: user.username,
    avatarColor: user.avatar_color,
    initials: user.initials,
    frame: user.equipped_frame ?? null,
    hat: user.equipped_hat ?? null,
  };

  return (
    <>
      <SiteHeader current="leaderboard" />
      <main className="page">
        <AppLive me={me} initialChat={initialChat} game="leaderboard" championId={championId}>
          <div style={{ marginBottom: "var(--sp-7)" }}>
            <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: "var(--sp-2)" }}>
              Leaderboard
            </h1>
            <p className="text-mute">
              Brag rights. Click a player to see their stats.
            </p>
          </div>

          <LeaderboardClient rows={rows} currentUserId={user.id} />
        </AppLive>
      </main>
    </>
  );
}
