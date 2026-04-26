// Server component shell every game page wraps with.
// Renders site header + balance bar + game title and mounts AppLive for chat/presence/bets.

import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Avatar } from "@/components/Avatar";
import { AppLive } from "@/components/social/AppLive";
import { DeckProvider } from "@/components/PlayingCard";
import { readSession } from "@/lib/auth/session";
import { getUserById, recentChatMessages } from "@/lib/db";
import { getBalance } from "@/lib/wallet";
import { getUserLevel } from "@/lib/xpServer";
import { getChampionId } from "@/lib/champion";
import { findItem } from "@/lib/shop/catalog";

export async function GameShell({
  title,
  blurb,
  game,
  children,
}: {
  title: string;
  blurb?: string;
  game: string;
  children: React.ReactNode;
}) {
  const s = await readSession();
  if (!s) redirect("/sign-in");
  const user = (await getUserById(s.user.id))!;
  const balance = await getBalance(user.id);
  const initialChat = await recentChatMessages(50);
  const xpInfo = await getUserLevel(user.id);
  const championId = await getChampionId();
  const deckItem = user.equipped_card_deck ? findItem(user.equipped_card_deck) : undefined;
  const palette = (deckItem?.meta as { palette?: string } | undefined)?.palette ?? "classic";

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
      <SiteHeader current="lobby" />
      <main className="page">
        <AppLive me={me} initialChat={initialChat} game={game} championId={championId}>
          <div className="row-lg" style={{ marginBottom: "var(--sp-6)", flexWrap: "wrap" }}>
            <Link href="/lobby" className="btn btn-ghost btn-sm">← Lobby</Link>
            <div className="balance-bar">
              <Avatar
                initials={user.initials}
                color={user.avatar_color}
                size={48}
                level={xpInfo.level}
                frame={user.equipped_frame ?? null}
                hat={user.equipped_hat ?? null}
                champion={user.id === championId}
              />
              <div className="avatar-username">
                <div className="uname">{user.username}</div>
                <div className="role">LVL {xpInfo.level}</div>
              </div>
              <div className="balance" data-balance>{balance.toLocaleString()} ¢</div>
            </div>
          </div>

          <div style={{ marginBottom: "var(--sp-5)" }}>
            <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: "var(--sp-2)" }}>{title}</h1>
            {blurb && <p className="text-mute">{blurb}</p>}
          </div>

          <DeckProvider palette={palette}>{children}</DeckProvider>
        </AppLive>
      </main>
    </>
  );
}
