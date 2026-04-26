import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { AppLive } from "@/components/social/AppLive";
import { readSession } from "@/lib/auth/session";
import { getUserById, recentChatMessages } from "@/lib/db";
import { getChampionId } from "@/lib/champion";
import { ClansClient } from "./ClansClient";

export default async function ClansPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");
  const user = (await getUserById(s.user.id))!;
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
      <SiteHeader current="clans" />
      <main className="page">
        <AppLive me={me} initialChat={initialChat} game="clans" championId={championId}>
          <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: "var(--sp-2)" }}>Clans</h1>
          <p className="text-mute" style={{ marginBottom: "var(--sp-6)" }}>
            Pick a posse. Win games together. Earn weekly chests.
          </p>
          <ClansClient meId={user.id} />
        </AppLive>
      </main>
    </>
  );
}
