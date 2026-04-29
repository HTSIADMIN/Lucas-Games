"use client";

import type { ReactNode } from "react";
import { LiveProvider } from "./LiveProvider";
import { ChatDrawer } from "./ChatDrawer";
import { DailyChallenges } from "@/components/DailyChallenges";
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
// Wraps the entire page (header + main) so the site header can read
// presence via useLive() and render the active-players strip.

export function AppLive({
  me,
  initialChat,
  game,
  championId = null,
  children,
}: {
  me: Me | null;
  initialChat: ChatMessagePublic[];
  game: string;
  championId?: string | null;
  children: ReactNode;
}) {
  return (
    <LiveProvider me={me} initialChat={initialChat} game={game} championId={championId}>
      {children}
      {me && <ChatDrawer currentUserId={me.id} />}
      {me && <DailyChallenges />}
    </LiveProvider>
  );
}
