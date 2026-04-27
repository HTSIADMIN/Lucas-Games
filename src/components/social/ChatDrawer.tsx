"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "./LiveProvider";
import { GameIcon } from "@/components/GameIcon";
import { Avatar } from "@/components/Avatar";

export function ChatDrawer({ currentUserId }: { currentUserId: string | null }) {
  const { chat, bets, championId } = useLive();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "bets">("chat");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenId, setLastSeenId] = useState<number>(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  // Each new incoming message bumps this so the launcher can replay a
  // one-shot "ping" ring + shake. Anchored to the latest chat id so
  // initial history doesn't trigger.
  const lastPingRef = useRef<number>(0);
  const [pingKey, setPingKey] = useState(0);

  // Anchor on first mount: latest existing message becomes "seen" so
  // history doesn't show as unread.
  useEffect(() => {
    if (lastSeenId === 0 && chat.length > 0) {
      setLastSeenId(chat[chat.length - 1].id);
    }
  }, [chat, lastSeenId]);

  // Replay the attention animation on a brand-new message from someone
  // else, when the drawer isn't already showing the chat tab.
  useEffect(() => {
    if (chat.length === 0) return;
    const latest = chat[chat.length - 1];
    if (lastPingRef.current === 0) {
      lastPingRef.current = latest.id;
      return;
    }
    if (latest.id <= lastPingRef.current) return;
    lastPingRef.current = latest.id;
    if (latest.user_id === currentUserId) return;
    if (open && tab === "chat") return;
    setPingKey((k) => k + 1);
  }, [chat, open, tab, currentUserId]);

  // Mark read when the chat tab is open.
  useEffect(() => {
    if (open && tab === "chat" && chat.length > 0) {
      setLastSeenId(chat[chat.length - 1].id);
    }
  }, [open, tab, chat]);

  // Unread count: own messages don't count.
  const unread = chat.filter((m) => m.id > lastSeenId && m.user_id !== currentUserId).length;

  // Tab-title flash so the notification reads even when window unfocused.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = "Lucas Games";
    if (!open && unread > 0) {
      document.title = `(${unread > 9 ? "9+" : unread}) ${original}`;
    } else {
      document.title = original;
    }
  }, [open, unread]);

  useEffect(() => {
    if (!open) return;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, bets, open, tab]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      const messages: Record<string, string> = {
        too_long: "Message too long.",
        empty: "Type something first.",
        no_such_user: "No player by that name.",
        no_self_tip: "You can't tip yourself.",
        insufficient_funds: "Not enough Coins to tip.",
      };
      setError(messages[data.error] ?? "Couldn't send.");
      return;
    }
    setDraft("");
  }

  return (
    <>
      {/* Floating launcher */}
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 100 }}>
        <div
          key={`launcher-${pingKey}`}
          style={{
            position: "relative",
            width: 56,
            height: 56,
            animation: !open && pingKey > 0 ? "chatShake 0.55s ease-out 1" : undefined,
          }}
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close chat" : "Open chat"}
            style={{
              position: "relative",
              width: 56,
              height: 56,
              background: "var(--gold-300)",
              border: "4px solid var(--ink-900)",
              boxShadow: open
                ? "var(--sh-button-press)"
                : unread > 0
                ? "var(--sh-card-rest), var(--glow-gold)"
                : "var(--sh-card-rest)",
              color: "var(--ink-900)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: !open && unread > 0 ? "chatPulse 1.4s ease-in-out infinite" : undefined,
              zIndex: 2,
            }}
          >
            <GameIcon name={open ? "ui.close" : "ui.chat"} size={32} />
          </button>

          {/* Ping rings — sonar ripple on each new message. */}
          {!open && pingKey > 0 && (
            <>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  border: "4px solid var(--gold-300)",
                  background: "transparent",
                  pointerEvents: "none",
                  animation: "chatPing 1s ease-out forwards",
                  zIndex: 1,
                }}
              />
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  border: "4px solid var(--crimson-300)",
                  background: "transparent",
                  pointerEvents: "none",
                  animation: "chatPing 1s ease-out 0.2s forwards",
                  zIndex: 1,
                }}
              />
            </>
          )}

          {!open && unread > 0 && (
            <span
              style={{
                position: "absolute",
                top: -8,
                right: -8,
                minWidth: 24,
                height: 24,
                padding: "0 6px",
                background: "var(--crimson-300)",
                color: "var(--parchment-50)",
                border: "3px solid var(--ink-900)",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: 13,
                textShadow: "1px 1px 0 var(--crimson-700)",
                boxShadow: "var(--sh-card-rest)",
                pointerEvents: "none",
                zIndex: 4,
              }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        <style>{`
          @keyframes chatPulse {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-3px); }
          }
          @keyframes chatPing {
            0%   { transform: scale(1);   opacity: 0.9; }
            100% { transform: scale(2);   opacity: 0;   }
          }
          @keyframes chatShake {
            0%, 100% { transform: translate(0, 0) rotate(0); }
            15%      { transform: translate(-2px, 0) rotate(-4deg); }
            30%      { transform: translate(2px, 0) rotate(3deg); }
            45%      { transform: translate(-2px, 0) rotate(-2deg); }
            60%      { transform: translate(2px, 0) rotate(2deg); }
            75%      { transform: translate(-1px, 0) rotate(-1deg); }
          }
        `}</style>
      </div>

      {/* Drawer */}
      {open && (
        <aside
          style={{
            position: "fixed",
            right: 16,
            bottom: 80,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(560px, calc(100vh - 120px))",
            background: "var(--parchment-100)",
            border: "4px solid var(--ink-900)",
            boxShadow: "var(--sh-popover)",
            display: "flex",
            flexDirection: "column",
            zIndex: 99,
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "3px solid var(--ink-900)" }}>
            <button
              type="button"
              onClick={() => setTab("chat")}
              style={tabStyle(tab === "chat")}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setTab("bets")}
              style={tabStyle(tab === "bets")}
            >
              Big Bets &amp; Odds
            </button>
          </div>

          {/* Body */}
          <div
            ref={messagesRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--sp-3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-2)",
            }}
          >
            {tab === "chat"
              ? chat.length === 0
                ? <p className="text-mute" style={{ textAlign: "center", marginTop: "var(--sp-7)" }}>Be the first to say something.</p>
                : chat.map((m) => (
                    <ChatLine key={m.id} m={m} mine={m.user_id === currentUserId} championId={championId} />
                  ))
              : bets.length === 0
                ? <p className="text-mute" style={{ textAlign: "center", marginTop: "var(--sp-7)" }}>Big wins and bigger losses show up here.</p>
                : bets.map((b) => <BetLine key={b.id} b={b} championId={championId} />)
            }
          </div>

          {/* Composer */}
          {tab === "chat" && (
            <form onSubmit={send} style={{ borderTop: "3px solid var(--ink-900)", padding: "var(--sp-2)" }}>
              {error && (
                <p style={{ color: "var(--crimson-500)", fontSize: 12, marginBottom: 6 }}>{error}</p>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Say something or /tip @friend 1000"
                  maxLength={280}
                  style={{ flex: 1, padding: "6px 8px", fontSize: 14 }}
                />
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={sending || !draft.trim()}
                >
                  Send
                </button>
              </div>
            </form>
          )}
        </aside>
      )}
    </>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    fontFamily: "var(--font-display)",
    fontSize: 16,
    letterSpacing: "var(--ls-loose)",
    textTransform: "uppercase",
    background: active ? "var(--gold-300)" : "var(--parchment-200)",
    color: active ? "var(--ink-900)" : "var(--saddle-400)",
    border: 0,
    borderRight: "3px solid var(--ink-900)",
    padding: "var(--sp-3)",
    cursor: "pointer",
  };
}

function ChatLine({ m, mine, championId }: {
  m: {
    id: number;
    user_id?: string;
    body: string;
    kind: string;
    username: string;
    avatar_color: string;
    initials: string;
    equipped_frame?: string | null;
    equipped_hat?: string | null;
    created_at: string;
  };
  mine: boolean;
  championId: string | null;
}) {
  const isTip = m.kind === "tip";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Avatar
        initials={m.initials}
        color={m.avatar_color}
        size={26}
        fontSize={11}
        frame={m.equipped_frame ?? null}
        hat={m.equipped_hat ?? null}
        champion={!!m.user_id && m.user_id === championId}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 13, color: mine ? "var(--gold-500)" : "var(--saddle-500)" }}>
          {m.username}
          {isTip && (
            <span style={{ marginLeft: 6 }}>
              <GameIcon name="ui.tip" size={12} />
            </span>
          )}
        </div>
        <div style={{
          fontSize: 14,
          color: isTip ? "var(--gold-500)" : "var(--ink-900)",
          fontStyle: isTip ? "italic" : "normal",
          wordBreak: "break-word",
        }}>
          {m.body}
        </div>
      </div>
    </div>
  );
}

function BetLine({ b, championId }: {
  b: {
    id: string;
    userId?: string;
    username: string;
    avatarColor: string;
    initials: string;
    frame?: string | null;
    hat?: string | null;
    game: string;
    bet: number;
    payout: number;
    net: number;
    multiplier?: number;
    bigOdds?: boolean;
  };
  championId: string | null;
}) {
  const win = b.net > 0;
  const showMultBadge = !!b.bigOdds && (b.multiplier ?? 0) >= 50;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 8px",
      background: win ? "var(--cactus-100)" : "var(--crimson-100)",
      border: "2px solid var(--ink-900)",
      boxShadow: showMultBadge ? "var(--glow-gold)" : undefined,
    }}>
      <Avatar
        initials={b.initials}
        color={b.avatarColor}
        size={26}
        fontSize={11}
        frame={b.frame ?? null}
        hat={b.hat ?? null}
        champion={!!b.userId && b.userId === championId}
      />
      <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 13 }}>
        <span>{b.username}</span>
        <span style={{ color: "var(--saddle-400)" }}> · {b.game}</span>
        {showMultBadge && (
          <span
            className="badge badge-gold badge-glow"
            style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", letterSpacing: "var(--ls-loose)" }}
            title={`Won ${formatMult(b.multiplier!)}× their bet`}
          >
            {formatMult(b.multiplier!)}×
          </span>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 14,
          color: win ? "var(--cactus-500)" : "var(--crimson-500)",
        }}
      >
        {win ? "+" : ""}{b.net.toLocaleString()}
      </span>
    </div>
  );
}

function formatMult(m: number): string {
  if (m >= 1000) return `${Math.round(m / 100) / 10}k`;
  if (m >= 100) return `${Math.round(m)}`;
  return `${Math.round(m * 10) / 10}`;
}
