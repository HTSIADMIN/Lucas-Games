"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { ChatMessagePublic } from "@/lib/db";
import { qualifyBet, MAX_FEED_ROWS } from "@/lib/feed/thresholds";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";

export type PresenceMember = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  frame?: string | null;
  hat?: string | null;
  game: string | null; // 'lobby' | 'slots' | 'crash' | etc.
  joinedAt: number;
};

export type LiveBet = {
  id: string;
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  frame?: string | null;
  hat?: string | null;
  game: string;
  bet: number;
  payout: number;
  net: number;
  multiplier: number;
  bigOdds: boolean;
  bigWealth: boolean;
  /** Player's current hot-streak length (consecutive RNG wins).
   *  0 when not on a streak. Surfaced as a flame badge by the chat
   *  feed when ≥ 3. */
  streak?: number;
  at: number;
};

type Me = {
  id: string;
  username: string;
  avatarColor: string;
  initials: string;
  frame?: string | null;
  hat?: string | null;
  /** XP-derived level. Optional so legacy callers don't break;
   *  falls back to 1 when missing. */
  level?: number;
};

type LiveCtx = {
  ready: boolean;
  /** The current user's profile (null when anonymous). Exposes the
   *  same fields LiveProvider was already given as a prop so pills
   *  / drawers don't have to re-thread it from the server. */
  me: Me | null;
  presence: PresenceMember[];
  bets: LiveBet[];
  chat: ChatMessagePublic[];
  championId: string | null;
  /** Per-user streak length, lazily refreshed for the currently-online
   *  presence list. Used by HeaderPresence to render the flame next
   *  to a username when the streak ≥ 3. Empty map when not yet
   *  populated. */
  streaksByUser: Record<string, number>;
  pushChat: (m: ChatMessagePublic) => void;
};

const Ctx = createContext<LiveCtx>({
  ready: false,
  me: null,
  presence: [],
  bets: [],
  chat: [],
  championId: null,
  streaksByUser: {},
  pushChat: () => {},
});

export function useLive() { return useContext(Ctx); }

const MAX_BETS = MAX_FEED_ROWS;
const MAX_CHAT = 100;

export function LiveProvider({
  me,
  initialChat,
  game,
  championId = null,
  children,
}: {
  me: {
    id: string;
    username: string;
    avatarColor: string;
    initials: string;
    frame?: string | null;
    hat?: string | null;
  } | null;
  initialChat: ChatMessagePublic[];
  game: string; // current page identifier
  championId?: string | null;
  children: React.ReactNode;
}) {
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [bets, setBets] = useState<LiveBet[]>([]);
  const [chat, setChat] = useState<ChatMessagePublic[]>(initialChat);
  const [ready, setReady] = useState(false);
  const [streaksByUser, setStreaksByUser] = useState<Record<string, number>>({});
  const gameRef = useRef(game);

  useEffect(() => { gameRef.current = game; }, [game]);

  function pushChat(m: ChatMessagePublic) {
    setChat((prev) => [...prev.filter((p) => p.id !== m.id), m].slice(-MAX_CHAT));
  }

  useEffect(() => {
    const supa = getBrowserClient();
    if (!supa || !me) return;

    // Bets feed channel — postgres_changes on game_sessions UPDATE
    const betsCh = supa.channel("lg-bets");
    betsCh
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_sessions" },
        async (payload) => {
          const row = payload.new as {
            id: string;
            user_id: string;
            game: string;
            bet: number;
            payout: number;
            status: string;
          };
          if (row.status !== "settled") return;
          const net = row.payout - row.bet;
          // Look up user info, current balance, AND current streak in
          // parallel. Pre-bet wealth = current_balance - net (this
          // settle just landed, so the live wallet view is post-settle).
          // Streak is a sub-50-row SQL function — cheap to call once
          // per enriched event.
          const [{ data: userData }, { data: balData }, { data: streakData }] = await Promise.all([
            supa.from("users_public").select("*").eq("id", row.user_id).maybeSingle(),
            supa.from("wallet_balances").select("balance").eq("user_id", row.user_id).maybeSingle(),
            supa.rpc("current_streak", { p_user_id: row.user_id }),
          ]);
          const u = (userData ?? {}) as {
            username?: string;
            avatar_color?: string;
            initials?: string;
            equipped_frame?: string | null;
            equipped_hat?: string | null;
          };
          const curBal = balData ? Number((balData as { balance: number | string }).balance) : undefined;
          const wealth = curBal != null ? Math.max(0, curBal - net) : undefined;
          const { multiplier, bigOdds, bigWealth, qualifies } = qualifyBet({
            bet: row.bet,
            payout: row.payout,
            wealth,
          });
          if (!qualifies) return;
          const streak = typeof streakData === "number" ? streakData : Number(streakData) || 0;
          setBets((prev) =>
            [
              {
                id: row.id,
                userId: row.user_id,
                username: u.username ?? "?",
                avatarColor: u.avatar_color ?? "var(--gold-300)",
                initials: u.initials ?? "??",
                frame: u.equipped_frame ?? null,
                hat: u.equipped_hat ?? null,
                game: row.game,
                bet: row.bet,
                payout: row.payout,
                net,
                multiplier,
                bigOdds,
                bigWealth,
                streak,
                at: Date.now(),
              },
              ...prev,
            ].slice(0, MAX_BETS),
          );
        },
      )
      .subscribe();

    // Chat channel — postgres_changes on chat_messages INSERT
    const chatCh = supa.channel("lg-chat");
    chatCh
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          const row = payload.new as { id: number };
          // Pull the public-view row so we get user fields.
          const { data } = await supa
            .from("chat_messages_public")
            .select("*")
            .eq("id", row.id)
            .maybeSingle();
          if (data) pushChat(data as ChatMessagePublic);
        },
      )
      .subscribe();

    // Presence channel
    const presCh = supa.channel("lg-presence", {
      config: { presence: { key: me.id } },
    });
    presCh
      .on("presence", { event: "sync" }, () => {
        const state = presCh.presenceState() as Record<string, PresenceMember[]>;
        const flat: PresenceMember[] = [];
        const seen = new Set<string>();
        for (const arr of Object.values(state)) {
          for (const m of arr) {
            if (seen.has(m.userId)) continue;
            seen.add(m.userId);
            flat.push(m);
          }
        }
        flat.sort((a, b) => a.joinedAt - b.joinedAt);
        setPresence(flat);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await presCh.track({
          userId: me.id,
          username: me.username,
          avatarColor: me.avatarColor,
          initials: me.initials,
          frame: me.frame ?? null,
          hat: me.hat ?? null,
          game: gameRef.current,
          joinedAt: Date.now(),
        } satisfies PresenceMember);
        setReady(true);
      });

    // Ping presence again whenever `game` changes
    const interval = setInterval(() => {
      presCh.track({
        userId: me.id,
        username: me.username,
        avatarColor: me.avatarColor,
        initials: me.initials,
        frame: me.frame ?? null,
        hat: me.hat ?? null,
        game: gameRef.current,
        joinedAt: Date.now(),
      });
    }, 30_000);

    return () => {
      clearInterval(interval);
      supa.removeChannel(betsCh);
      supa.removeChannel(chatCh);
      supa.removeChannel(presCh);
    };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-track when game changes (page navigation)
  useEffect(() => {
    const supa = getBrowserClient();
    if (!supa || !me) return;
    const ch = supa.getChannels().find((c) => c.topic === "realtime:lg-presence");
    if (!ch) return;
    ch.track({
      userId: me.id,
      username: me.username,
      avatarColor: me.avatarColor,
      initials: me.initials,
      frame: me.frame ?? null,
      hat: me.hat ?? null,
      game,
      joinedAt: Date.now(),
    });
  }, [game, me]);

  // Chat + bets fallback — Realtime postgres_changes is the primary
  // path, but in browsers / networks where it's flaky we merge in the
  // snapshot's chat[] and bets[] fields. AppSnapshotProvider polls
  // /api/app/snapshot every ~10s and exposes the same shape we used
  // to fetch from /api/social/live. Reading via context drops the
  // separate 6s poll entirely.
  const { snapshot } = useAppSnapshot();
  useEffect(() => {
    if (!me || !snapshot) return;
    const incomingChat = snapshot.chat;
    if (incomingChat.length > 0) {
      setChat((prev) => {
        const byId = new Map<number, ChatMessagePublic>();
        for (const m of prev) byId.set(m.id, m);
        for (const m of incomingChat) byId.set(m.id, m);
        return Array.from(byId.values())
          .sort((a, b) => a.id - b.id)
          .slice(-MAX_CHAT);
      });
    }
    const incomingBets = snapshot.bets;
    if (incomingBets.length > 0) {
      setBets((prev) => {
        const byId = new Map<string, LiveBet>();
        for (const m of prev) byId.set(m.id, m);
        for (const b of incomingBets) byId.set(b.id, b);
        return Array.from(byId.values())
          .sort((a, b) => b.at - a.at)
          .slice(0, MAX_BETS);
      });
    }
  }, [me, snapshot]);

  // Periodically refresh per-presence-user streak counts so the
  // HeaderPresence strip can render a flame next to anyone on a
  // ≥3-win run. Batched into a single RPC against
  // `current_streaks_for(uuid[])` — one round-trip, no N+1.
  useEffect(() => {
    if (!me) return;
    const ids = presence.map((p) => p.userId);
    if (ids.length === 0) return;
    let cancelled = false;
    async function refresh() {
      const supa = getBrowserClient();
      if (!supa) return;
      try {
        const { data } = await supa.rpc("current_streaks_for", { p_user_ids: ids });
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const row of (data ?? []) as { user_id: string; length: number }[]) {
          next[row.user_id] = Number(row.length) || 0;
        }
        setStreaksByUser(next);
      } catch {
        /* keep the previous map */
      }
    }
    void refresh();
    // Re-fetch every 30s — presence churns quickly but the streak
    // value only changes when a new session settles.
    const t = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // Re-fire when the set of presenced user ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, presence.map((p) => p.userId).join("|")]);

  const value = useMemo(
    () => ({ ready, me, presence, bets, chat, championId, streaksByUser, pushChat }),
    [ready, me, presence, bets, chat, championId, streaksByUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
