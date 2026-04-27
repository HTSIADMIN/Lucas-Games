import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Avatar } from "@/components/Avatar";
import { AppLive } from "@/components/social/AppLive";
import { HeaderPresence } from "@/components/social/HeaderPresence";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getUserById, recentChatMessages } from "@/lib/db";
import { getUserLevel } from "@/lib/xpServer";
import { getChampionId } from "@/lib/champion";
import { GameIcon, type GameIconName } from "@/components/GameIcon";
import { SignOutButton } from "./SignOutButton";
import { FreeGamesButton } from "./FreeGamesButton";

type GameTile = {
  slug: string;
  name: string;
  tag: string;
  live: boolean;
  icon: GameIconName;
};

const GAMES: GameTile[] = [
  { slug: "coinflip",      name: "Coin Flip",       tag: "QUICK",   live: true, icon: "lobby.coinflip" },
  { slug: "coinflip-duel", name: "Coin Flip Duel",  tag: "PvP",     live: true, icon: "lobby.coinflip_duel" },
  { slug: "dice",          name: "Dice",            tag: "QUICK",   live: true, icon: "lobby.dice" },
  { slug: "slots",         name: "Slots",           tag: "JACKPOT", live: true, icon: "lobby.slots" },
  { slug: "blackjack-mp",  name: "Blackjack Table", tag: "MULTI",   live: true, icon: "lobby.blackjack" },
  { slug: "roulette",      name: "Roulette",        tag: "CLASSIC", live: true, icon: "lobby.roulette" },
  { slug: "mines",         name: "Mines",           tag: "RISKY",   live: true, icon: "lobby.mines" },
  { slug: "plinko",        name: "Plinko",          tag: "PHYSICS", live: true, icon: "lobby.plinko" },
  { slug: "crash",         name: "Crash",           tag: "LIVE",    live: true, icon: "lobby.crash" },
  { slug: "poker",         name: "Poker",           tag: "MULTI",   live: true, icon: "lobby.poker" },
];

export default async function LobbyPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  const user = (await getUserById(s.user.id))!;
  const balance = await getBalance(user.id);
  const initialChat = await recentChatMessages(50);
  const xpInfo = await getUserLevel(user.id);
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
    <AppLive me={me} initialChat={initialChat} game="lobby" championId={championId}>
      <SiteHeader current="lobby" centerSlot={<HeaderPresence currentUserId={user.id} />} />
      <main className="page">
        <section className="row-lg" style={{ marginBottom: "var(--sp-7)", flexWrap: "wrap" }}>
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
            <div className="balance">{balance.toLocaleString()} ¢</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
            <FreeGamesButton />
            <SignOutButton />
          </div>
        </section>

        <section style={{ marginBottom: "var(--sp-5)" }}>
          <div className="divider">Pick a Table</div>
        </section>

        <div className="grid grid-3 lobby-tile-grid">
          {GAMES.map((g) => (
            <Link
              key={g.slug}
              href={g.live ? `/games/${g.slug}` : "#"}
              className="tile"
              style={!g.live ? { opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" } : undefined}
              aria-disabled={!g.live || undefined}
            >
              <div className="tile-art">
                <GameIcon name={g.icon} size={140} />
              </div>
              <div className="tile-name">{g.name}</div>
              <div className="tile-meta">
                <span className={`badge ${g.live ? "badge-cactus" : ""}`}>
                  {g.live ? "OPEN" : g.tag}
                </span>
                <span>{g.live ? "Play →" : "Coming soon"}</span>
              </div>
            </Link>
          ))}
        </div>

      </main>
    </AppLive>
  );
}
