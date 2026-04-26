"use client";

import type { ReactNode } from "react";
import { LiveProvider } from "./LiveProvider";
import { ChatDrawer } from "./ChatDrawer";
import { PresenceRail } from "./PresenceRail";
import type { ChatMessagePublic } from "@/lib/db";

// Single client wrapper used by every authed page. Loads:
//   - Realtime presence (who's online + which game)
//   - Global chat (history + live)
//   - Big-bets feed (postgres_changes on game_sessions settle)
// And renders the shared chrome (presence rail at top, chat drawer floating).

export function AppLive({
  me,
  initialChat,
  game,
  showRail = true,
  children,
}: {
  me: { id: string; username: string; avatarColor: string; initials: string } | null;
  initialChat: ChatMessagePublic[];
  game: string;
  showRail?: boolean;
  children: ReactNode;
}) {
  return (
    <LiveProvider me={me} initialChat={initialChat} game={game}>
      {showRail && <PresenceRail currentUserId={me?.id ?? null} />}
      {children}
      {me && <ChatDrawer currentUserId={me.id} />}
    </LiveProvider>
  );
}
