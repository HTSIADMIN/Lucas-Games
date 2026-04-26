"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "./LiveProvider";
import { GameIcon } from "@/components/GameIcon";

export function ChatDrawer({ currentUserId }: { currentUserId: string | null }) {
  const { chat, bets } = useLive();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "bets">("chat");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          width: 56,
          height: 56,
          background: "var(--gold-300)",
          border: "4px solid var(--ink-900)",
          boxShadow: open ? "var(--sh-button-press)" : "var(--sh-card-rest)",
          fontFamily: "var(--font-display)",
          fontSize: 24,
          color: "var(--ink-900)",
          cursor: "pointer",
          zIndex: 100,
        }}
      >
        {open ? "×" : "💬"}
      </button>

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
              Big Bets
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
                    <ChatLine key={m.id} m={m} mine={m.user_id === currentUserId} />
                  ))
              : bets.length === 0
                ? <p className="text-mute" style={{ textAlign: "center", marginTop: "var(--sp-7)" }}>Big wins and bigger losses show up here.</p>
                : bets.map((b) => <BetLine key={b.id} b={b} />)
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

function ChatLine({ m, mine }: { m: { id: number; body: string; kind: string; username: string; avatar_color: string; initials: string; created_at: string }; mine: boolean }) {
  const isTip = m.kind === "tip";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div
        className="avatar avatar-sm"
        style={{ background: m.avatar_color, fontSize: 11, width: 24, height: 24, borderWidth: 2, flexShrink: 0 }}
      >
        {m.initials}
      </div>
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

function BetLine({ b }: { b: { id: string; username: string; avatarColor: string; initials: string; game: string; bet: number; payout: number; net: number } }) {
  const win = b.net > 0;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 8px",
      background: win ? "var(--cactus-100)" : "var(--crimson-100)",
      border: "2px solid var(--ink-900)",
    }}>
      <div
        className="avatar avatar-sm"
        style={{ background: b.avatarColor, fontSize: 11, width: 24, height: 24, borderWidth: 2, flexShrink: 0 }}
      >
        {b.initials}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 13 }}>
        <span>{b.username}</span>
        <span style={{ color: "var(--saddle-400)" }}> · {b.game}</span>
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
