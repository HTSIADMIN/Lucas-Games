"use client";

import Link from "next/link";
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
  scratch: "Scratch",
  "daily-spin": "Daily Spin",
  "crossy-road": "Crossy Road",
  flappy: "Flappy",
  snake: "Snake",
  monopoly: "Monopoly",
  "penny-pinchers": "Penny Pinchers",
  shop: "Shop",
  leaderboard: "Leaderboard",
  clans: "Clans",
};

// Map a presence game-key to the route the player is currently on.
// Lobby / shop / leaderboard / clans are top-level; everything under
// /games/* is a casino game; everything under /earn/* is a free game.
const GAME_HREF: Record<string, string> = {
  lobby: "/lobby",
  shop: "/shop",
  leaderboard: "/leaderboard",
  clans: "/clans",
  blackjack: "/games/blackjack",
  "blackjack-mp": "/games/blackjack-mp",
  slots: "/games/slots",
  poker: "/games/poker",
  plinko: "/games/plinko",
  coinflip: "/games/coinflip",
  "coinflip-duel": "/games/coinflip-duel",
  mines: "/games/mines",
  dice: "/games/dice",
  crash: "/games/crash",
  roulette: "/games/roulette",
  scratch: "/games/scratch",
  "daily-spin": "/earn/daily-spin",
  "crossy-road": "/earn/crossy-road",
  flappy: "/earn/flappy",
  snake: "/earn/snake",
  monopoly: "/earn/monopoly",
  "penny-pinchers": "/earn/penny-pinchers",
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
        {presence.slice(0, 8).map((m) => {
          const isMe = m.userId === currentUserId;
          const label = m.game ? GAME_LABEL[m.game] ?? m.game : "...";
          const href = m.game ? GAME_HREF[m.game] : null;
          // Click-to-jump: each pill is a link to whatever room the
          // player is currently in. Falls back to a non-clickable
          // pill if we don't recognize the game key (e.g. a new room
          // we haven't mapped yet).
          const inner = (
            <>
              <Avatar
                initials={m.initials}
                color={m.avatarColor}
                size={26}
                fontSize={11}
                frame={m.frame ?? null}
                hat={m.hat ?? null}
                champion={m.userId === championId}
              />
              <span className="header-presence-pill-label">{label}</span>
            </>
          );
          if (href) {
            return (
              <Link
                key={m.userId}
                href={href}
                title={`${m.username} — ${label} · click to join`}
                className={`header-presence-pill is-link${isMe ? " is-me" : ""}`}
              >
                {inner}
              </Link>
            );
          }
          return (
            <div
              key={m.userId}
              title={`${m.username} — ${label}`}
              className={`header-presence-pill${isMe ? " is-me" : ""}`}
            >
              {inner}
            </div>
          );
        })}
        {presence.length > 8 && (
          <span className="header-presence-more">+{presence.length - 8}</span>
        )}
      </div>
    </div>
  );
}
