// Server component shell every game page wraps with.
// Renders site header (with profile + balance + presence) and mounts AppLive
// for chat/presence/bets. The in-page balance-bar moved to the header.

import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { AppLive } from "@/components/social/AppLive";
import { HeaderPresence } from "@/components/social/HeaderPresence";
import { HeaderBalance } from "@/components/HeaderBalance";
import { DeckProvider } from "@/components/PlayingCard";
import { FreeGamesButton } from "@/app/lobby/FreeGamesButton";
import { isFreeGame } from "@/lib/games/freeGames";
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

  const showFreeGamesButton = isFreeGame(game);

  const me = {
    id: user.id,
    username: user.username,
    avatarColor: user.avatar_color,
    initials: user.initials,
    frame: user.equipped_frame ?? null,
    hat: user.equipped_hat ?? null,
  };

  return (
    <AppLive me={me} initialChat={initialChat} game={game} championId={championId}>
      <SiteHeader
        current="lobby"
        compact
        centerSlot={<HeaderPresence currentUserId={user.id} />}
        rightSlot={
          <HeaderBalance
            initials={user.initials}
            avatarColor={user.avatar_color}
            username={user.username}
            level={xpInfo.level}
            frame={user.equipped_frame ?? null}
            hat={user.equipped_hat ?? null}
            champion={user.id === championId}
            balance={balance}
          />
        }
      />
      <main className="page page-game">
        <div
          className="row"
          style={{
            gap: "var(--sp-3)",
            marginBottom: "var(--sp-3)",
            flexWrap: "wrap",
            alignItems: "baseline",
          }}
        >
          <Link href="/lobby" className="btn btn-ghost btn-sm">← Lobby</Link>
          {showFreeGamesButton && <FreeGamesButton compact />}
          <h1 className="game-shell-title" style={{ fontSize: "var(--fs-h3)", margin: 0 }}>
            {title}
          </h1>
          {blurb && <span className="text-mute game-shell-blurb">{blurb}</span>}
        </div>

        <DeckProvider palette={palette}>{children}</DeckProvider>
      </main>
    </AppLive>
  );
}
