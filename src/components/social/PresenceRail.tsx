"use client";

import { useLive } from "./LiveProvider";
import { GameIcon } from "@/components/GameIcon";

const GAME_LABEL: Record<string, string> = {
  lobby: "Lobby",
  blackjack: "Blackjack",
  slots: "Slots",
  poker: "Poker",
  plinko: "Plinko",
  coinflip: "Coin Flip",
  mines: "Mines",
  dice: "Dice",
  crash: "Crash",
  roulette: "Roulette",
  "daily-spin": "Daily Spin",
  "crossy-road": "Crossy Road",
  shop: "Shop",
  leaderboard: "Leaderboard",
  "sign-in": "Signing in",
};

export function PresenceRail({ currentUserId }: { currentUserId: string | null }) {
  const { presence, ready } = useLive();
  if (!ready || presence.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--saddle-500)",
        border: "3px solid var(--ink-900)",
        padding: "var(--sp-3) var(--sp-4)",
        boxShadow: "var(--sh-card-rest)",
        marginBottom: "var(--sp-5)",
        display: "flex",
        gap: "var(--sp-3)",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-tiny)",
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          color: "var(--gold-300)",
          textShadow: "1px 1px 0 var(--ink-900)",
        }}
      >
        <GameIcon name="ui.dot" size={10} style={{ marginRight: 6 }} />
        At the Saloon ({presence.length})
      </span>
      {presence.map((m) => {
        const isMe = m.userId === currentUserId;
        const label = m.game ? GAME_LABEL[m.game] ?? m.game : "...";
        return (
          <div
            key={m.userId}
            title={`${m.username} — ${label}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-2)",
              padding: "2px 8px 2px 2px",
              background: "var(--saddle-600)",
              border: `2px solid ${isMe ? "var(--gold-300)" : "var(--ink-900)"}`,
            }}
          >
            <div
              className="avatar avatar-sm"
              style={{ background: m.avatarColor, fontSize: 12, width: 24, height: 24, borderWidth: 2 }}
            >
              {m.initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-small)",
                  color: "var(--parchment-50)",
                }}
              >
                {m.username}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "var(--gold-300)" }}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
