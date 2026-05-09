"use client";

import type { ReactNode } from "react";
import { LiveProvider } from "./LiveProvider";
import { ChatDrawer } from "./ChatDrawer";
import { DailyChallenges } from "@/components/DailyChallenges";
import { DailySpinReadyToast } from "@/components/DailySpinReadyToast";
import { EventTicker } from "@/components/EventTicker";
import { BigEventToast } from "@/components/BigEventToast";
import { AppSnapshotProvider } from "@/components/AppSnapshotProvider";
import type { ChatMessagePublic } from "@/lib/db";

export type Me = {
  id: string;
  username: string;
  avatarColor: string;
  initials: string;
  frame?: string | null;
  hat?: string | null;
};

// Single client wrapper used by every authed page. Loads:
//   - Realtime presence (who's online + which game)
//   - Global chat (history + live)
//   - Big-bets feed (postgres_changes on game_sessions settle)
//   - The combined per-user app snapshot (balance, active event,
//     free-games readiness, daily-challenge claimable count) — single
//     poll feeds the header balance, event ticker, and Daily fab.
// Wraps the entire page (header + main) so the site header can read
// presence via useLive() and render the active-players strip.

export function AppLive({
  me,
  initialBalance = 0,
  initialChat,
  game,
  championId = null,
  children,
}: {
  me: Me | null;
  /** Server-rendered balance so the header doesn't flash on first paint. */
  initialBalance?: number;
  initialChat: ChatMessagePublic[];
  game: string;
  championId?: string | null;
  children: ReactNode;
}) {
  // Snapshot wraps Live so LiveProvider can consume the chat + bets
  // fallback feed via useAppSnapshot() — saves a separate /social/live
  // poll. Realtime channels in LiveProvider still push updates
  // independently, so this only affects the polling fallback.
  return (
    <AppSnapshotProvider initialBalance={initialBalance} enabled={!!me}>
      <LiveProvider me={me} initialChat={initialChat} game={game} championId={championId}>
        {me && <EventTicker />}
        {children}
        {me && <ChatDrawer currentUserId={me.id} />}
        {me && <DailyChallenges />}
        {me && <BigEventToast />}
        {me && <DailySpinReadyToast />}
      </LiveProvider>
    </AppSnapshotProvider>
  );
}
