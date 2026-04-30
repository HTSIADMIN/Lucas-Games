import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Avatar } from "@/components/Avatar";
import { AppLive } from "@/components/social/AppLive";
import { HeaderPresence } from "@/components/social/HeaderPresence";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import {
  getActiveBlackjackRound,
  getUserById,
  listBlackjackSeats,
  listOpenCoinflipDuels,
  recentChatMessages,
} from "@/lib/db";
import { getDefaultTableId, listSeatedUserIds } from "@/lib/games/poker/scheduler";
import { getUserLevel } from "@/lib/xpServer";
import { getChampionId } from "@/lib/champion";
import { GameIcon, type GameIconName } from "@/components/GameIcon";
import { TilePresence } from "@/components/TilePresence";
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
  // Multiplayer "waiting" alerts. The lobby checks each MP game and
  // pulses its tile when another player is waiting for the user to
  // join. We always exclude the current player's own seat / challenge
  // so the alert is actionable from this user's perspective.
  //
  // Coinflip Duel: open challenges from anyone-but-me.
  // Poker:         seated player at The Saloon table who isn't me.
  // Blackjack-MP:  active round that has at least one seat I don't own.
  const [openDuels, pokerTableId, blackjackRound] = await Promise.all([
    listOpenCoinflipDuels(),
    getDefaultTableId().catch(() => null),
    getActiveBlackjackRound().catch(() => null),
  ]);
  const openDuelsForMe = openDuels.filter((d) => d.challenger_id !== user.id).length;
  const pokerWaitersForMe = pokerTableId
    ? (await listSeatedUserIds(pokerTableId).catch(() => [] as string[])).filter((id) => id !== user.id).length
    : 0;
  const blackjackWaitersForMe = blackjackRound
    ? (await listBlackjackSeats(blackjackRound.id).catch(() => [])).filter((seat) => seat.user_id !== user.id).length
    : 0;
  const ALERTS: Record<string, number> = {
    "coinflip-duel": openDuelsForMe,
    "poker": pokerWaitersForMe,
    "blackjack-mp": blackjackWaitersForMe,
  };
  const ALERT_LABEL: Record<string, (n: number) => string> = {
    "coinflip-duel": (n) => `${n} OPEN BET${n === 1 ? "" : "S"}`,
    "poker":         (n) => `${n} AT TABLE`,
    "blackjack-mp":  (n) => `${n} AT TABLE`,
  };
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
          {CATEGORY_ORDER.flatMap(({ key }) => GAMES.filter((g) => g.category === key)).map((g) => {
            const alertCount = ALERTS[g.slug] ?? 0;
            const isAlert = g.live && alertCount > 0;
            const alertText = isAlert && ALERT_LABEL[g.slug] ? ALERT_LABEL[g.slug](alertCount) : null;
            return (
              <Link
                key={g.slug}
                href={g.live ? `/games/${g.slug}` : "#"}
                className={`tile${isAlert ? " tile-alert" : ""}`}
                style={!g.live ? { opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" } : undefined}
                aria-disabled={!g.live || undefined}
              >
                <div className="tile-art" style={{ position: "relative" }}>
                  <GameIcon name={g.icon} size={140} />
                  {isAlert && (
                    <span aria-hidden className="tile-alert-dot">
                      {alertCount}
                    </span>
                  )}
                </div>
                <div className="tile-name">{g.name}</div>
                <div className="tile-meta">
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    {isAlert && (
                      <span className="badge badge-crimson">{alertText}</span>
                    )}
                    {!g.live && <span className="badge">{g.tag}</span>}
                    {g.multiplayer && !isAlert && (
                      <span className="badge badge-sky">2P+</span>
                    )}
                    {g.live && <TilePresence slug={g.slug} />}
                  </span>
                  <span>{g.live ? (isAlert ? "Join →" : "Play →") : "Coming soon"}</span>
                </div>
              </Link>
            );
          })}
        </div>

      </main>
    </AppLive>
  );
}
