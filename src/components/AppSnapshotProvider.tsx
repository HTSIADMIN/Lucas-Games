"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";
import type { ChatMessagePublic } from "@/lib/db";
import type { LiveBet } from "@/components/social/LiveProvider";

// Single-poll context that exposes balance, active event, free-games
// readiness, daily-challenge claimable count, AND the chat + big-bets
// HTTP fallback that LiveProvider used to fetch separately.
// Consumed by header fixtures (LiveBalance), the EventTicker,
// FreeGamesButton, the DailyChallenges launcher badge, and
// LiveProvider — all formerly polling their own endpoints. One ~10s
// poll instead of five independent ones. (Realtime channels for
// chat / bets / presence keep pushing updates instantly; the snapshot
// only carries the fallback feed.)

export type ActiveEvent = {
  kind: "lucky_hour";
  multiplier: number;
  endsAt: number;
  title: string;
  blurb: string;
} | null;

export type EarnStatus = {
  serverNow?: number;
  dailySpin: { ready: boolean; nextAt: number | null; bonusTokens: number };
  monopoly: { ready: boolean; nextAt: number | null };
};

export type WinningsWindow = {
  bet: number;
  won: number;
  net: number;
};

export type WinningsSnapshot = {
  today: WinningsWindow;
  week: WinningsWindow;
};

export type CompetitiveSnapshot = {
  myRank: number | null;
  myBalance: number;
  totalPlayers: number;
  rival: {
    userId: string;
    username: string;
    avatarColor: string;
    initials: string;
    frame: string | null;
    hat: string | null;
    balance: number;
    /** rival.balance - my.balance — non-negative. */
    gap: number;
  } | null;
  championId: string | null;
  championSince: string | null;
};

export type AppSnapshot = {
  balance: number;
  event: ActiveEvent;
  earn: EarnStatus;
  dailyClaimable: number;
  /** Recent chat history — Realtime is the primary path. */
  chat: ChatMessagePublic[];
  /** Recent qualifying big-bets feed — Realtime is the primary path. */
  bets: LiveBet[];
  /** Catch-me chip / rank-drop toast context. */
  competitive: CompetitiveSnapshot;
  /** Daily / weekly winnings chips under the header balance. */
  winnings: WinningsSnapshot;
  /** Current hot-streak length for the requesting user. */
  streak: { length: number };
};

type Ctx = {
  snapshot: AppSnapshot | null;
  /** Force an immediate refresh — call after a wallet-affecting action. */
  refresh: () => void;
  /** Optimistically set the balance without a fetch (used by `lg:balance`). */
  setBalance: (n: number) => void;
};

const SnapshotCtx = createContext<Ctx>({
  snapshot: null,
  refresh: () => {},
  setBalance: () => {},
});

export function useAppSnapshot() {
  return useContext(SnapshotCtx);
}

const POLL_MS = 10_000;

export function AppSnapshotProvider({
  initialBalance,
  enabled,
  children,
}: {
  /** Server-rendered initial balance so the header doesn't flash. */
  initialBalance: number;
  /** False when the user is anonymous — provider becomes a no-op. */
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(
    enabled
      ? {
          balance: initialBalance,
          event: null,
          earn: {
            dailySpin: { ready: false, nextAt: null, bonusTokens: 0 },
            monopoly: { ready: false, nextAt: null },
          },
          dailyClaimable: 0,
          chat: [],
          bets: [],
          competitive: {
            myRank: null,
            myBalance: initialBalance,
            totalPlayers: 0,
            rival: null,
            championId: null,
            championSince: null,
          },
          winnings: {
            today: { bet: 0, won: 0, net: 0 },
            week: { bet: 0, won: 0, net: 0 },
          },
          streak: { length: 0 },
        }
      : null,
  );

  const fetchSnapshot = useCallback(async () => {
    if (!enabled) return;
    try {
      // Pass the browser's IANA timezone so the server can compute
      // "today" / "this week" boundaries against the player's
      // mental model (instead of always UTC).
      const headers: Record<string, string> = {};
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) headers["time-zone"] = tz;
      } catch {
        /* ignore — server falls back to UTC */
      }
      const r = await fetch("/api/app/snapshot", { headers });
      if (!r.ok) return;
      const data = (await r.json()) as AppSnapshot;
      setSnapshot(data);
      // Re-broadcast balance for any non-context listener (BrokeModal,
      // legacy code) that still listens to the existing window event.
      window.dispatchEvent(new CustomEvent("lg:balance", { detail: data.balance }));
    } catch {
      // ignore — try again next tick
    }
  }, [enabled]);

  useVisibleInterval(fetchSnapshot, enabled ? POLL_MS : null);

  // Initial fetch on mount so consumers don't have to wait one full
  // poll interval for fresh data.
  useEffect(() => {
    if (enabled) void fetchSnapshot();
  }, [enabled, fetchSnapshot]);

  // Allow game clients to push a fresh balance into the context
  // without waiting for the next poll. They already dispatch
  // `lg:balance` after wins/losses (legacy contract from LiveBalance).
  useEffect(() => {
    if (!enabled) return;
    function onBalance(e: Event) {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail !== "number") return;
      setSnapshot((prev) => (prev ? { ...prev, balance: ce.detail } : prev));
    }
    window.addEventListener("lg:balance", onBalance as EventListener);
    return () => window.removeEventListener("lg:balance", onBalance as EventListener);
  }, [enabled]);

  const setBalance = useCallback((n: number) => {
    setSnapshot((prev) => (prev ? { ...prev, balance: n } : prev));
  }, []);

  const value = useMemo(
    () => ({ snapshot, refresh: fetchSnapshot, setBalance }),
    [snapshot, fetchSnapshot, setBalance],
  );

  return <SnapshotCtx.Provider value={value}>{children}</SnapshotCtx.Provider>;
}
