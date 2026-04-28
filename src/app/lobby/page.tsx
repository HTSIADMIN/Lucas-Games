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

type GameCategory = "cards" | "coins" | "dice" | "other";

type GameTile = {
  slug: string;
  name: string;
  tag: string;
  live: boolean;
  icon: GameIconName;
  category: GameCategory;
  multiplayer?: boolean;
};

const GAMES: GameTile[] = [
  // Cards
  { slug: "blackjack-mp",  name: "Blackjack Table", tag: "MULTI",   live: true, icon: "lobby.blackjack",      category: "cards", multiplayer: true },
  { slug: "poker",         name: "Poker",           tag: "MULTI",   live: true, icon: "lobby.poker",          category: "cards", multiplayer: true },
  // Coins
  { slug: "coinflip",      name: "Coin Flip",       tag: "QUICK",   live: true, icon: "lobby.coinflip",       category: "coins" },
  { slug: "coinflip-duel", name: "Coin Flip Duel",  tag: "PvP",     live: true, icon: "lobby.coinflip_duel",  category: "coins", multiplayer: true },
  // Dice
  { slug: "dice",          name: "Dice",            tag: "QUICK",   live: true, icon: "lobby.dice",           category: "dice" },
  // Other
  { slug: "scratch",       name: "Golden Bounty",   tag: "INSTANT", live: true, icon: "lobby.scratch",        category: "other" },
  { slug: "slots",         name: "Slots",           tag: "JACKPOT", live: true, icon: "lobby.slots",          category: "other" },
  { slug: "roulette",      name: "Roulette",        tag: "CLASSIC", live: true, icon: "lobby.roulette",       category: "other" },
  { slug: "mines",         name: "Mines",           tag: "RISKY",   live: true, icon: "lobby.mines",          category: "other" },
  { slug: "plinko",        name: "Plinko",          tag: "PHYSICS", live: true, icon: "lobby.plinko",         category: "other" },
  { slug: "crash",         name: "Crash",           tag: "LIVE",    live: true, icon: "lobby.crash",          category: "other" },
];

const CATEGORY_ORDER: { key: GameCategory; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "coins", label: "Coins" },
  { key: "dice",  label: "Dice" },
  { key: "other", label: "House Games" },
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
          <div
            className="lobby-action-buttons"
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: "var(--sp-2)",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <FreeGamesButton />
            <SignOutButton />
          </div>
        </section>

        <section style={{ marginBottom: "var(--sp-5)" }}>
          <div className="divider">Pick a Table</div>
        </section>

        <div className="grid grid-4 lobby-tile-grid">
          {CATEGORY_ORDER.flatMap(({ key }) => GAMES.filter((g) => g.category === key)).map((g) => (
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
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <span className={`badge ${g.live ? "badge-cactus" : ""}`}>
                    {g.live ? "OPEN" : g.tag}
                  </span>
                  {g.multiplayer && (
                    <span className="badge badge-sky">2P+</span>
                  )}
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
