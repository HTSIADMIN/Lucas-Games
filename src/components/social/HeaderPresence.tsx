"use client";

import { useLive } from "./LiveProvider";
import { Avatar } from "@/components/Avatar";

const GAME_LABEL: Record<string, string> = {
  lobby: "Lobby",
  blackjack: "Blackjack",
  "blackjack-mp": "Blackjack",
  slots: "Slots",
  poker: "Poker",
  plinko: "Plinko",
  coinflip: "Coin Flip",
  "coinflip-duel": "Coin Flip",
  mines: "Mines",
  dice: "Dice",
  crash: "Crash",
  roulette: "Roulette",
  "daily-spin": "Daily Spin",
  "crossy-road": "Crossy Road",
  flappy: "Flappy",
  monopoly: "Monopoly",
  shop: "Shop",
  leaderboard: "Leaderboard",
  clans: "Clans",
};

export function HeaderPresence({ currentUserId }: { currentUserId: string | null }) {
  const { presence, ready, championId } = useLive();
  if (!ready || presence.length === 0) return null;

  return (
    <div className="header-presence">
      <span className="header-presence-label">
        At the Saloon ({presence.length})
      </span>
      <div className="header-presence-list">
        {presence.slice(0, 10).map((m) => {
          const isMe = m.userId === currentUserId;
          const label = m.game ? GAME_LABEL[m.game] ?? m.game : "...";
          return (
            <span
              key={m.userId}
              title={`${m.username} — ${label}`}
              style={{
                display: "inline-flex",
                outline: isMe ? "2px solid var(--gold-300)" : undefined,
                outlineOffset: 1,
              }}
            >
              <Avatar
                initials={m.initials}
                color={m.avatarColor}
                size={28}
                fontSize={12}
                frame={m.frame ?? null}
                hat={m.hat ?? null}
                champion={m.userId === championId}
              />
            </span>
          );
        })}
        {presence.length > 10 && (
          <span className="header-presence-more">+{presence.length - 10}</span>
        )}
      </div>
    </div>
  );
}
