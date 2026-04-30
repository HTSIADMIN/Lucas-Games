"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/social/LiveProvider";

// Bottom-left toast that pops up whenever someone takes a swing
// big enough to count as a "big swing relative to wealth"
// (`bigWealth` on the live bets feed). Green for wins, red for
// losses. Each toast lives for ~4.5s — fades out via CSS over the
// last second.
//
// We dedupe via a ref-tracked Set so polling-driven re-arrivals of
// the same row don't double-fire. Old toasts (>30s past their
// settle timestamp) never fire so the first paint after a refresh
// doesn't show stale events.

const TOAST_LIFE_MS = 4500;
const STALE_AFTER_MS = 30_000;

type Toast = {
  id: string;
  net: number;
  username: string;
  game: string;
  bornAt: number;
};

export function BigEventToast() {
  const { bets } = useLive();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh: Toast[] = [];
    for (const b of bets) {
      if (seenRef.current.has(b.id)) continue;
      seenRef.current.add(b.id);
      // For now we toast every bet that lands in the live feed.
      // The bigWealth/bigOdds flags still get computed and shown
      // on the chip, but the bottom-left toast doesn't gate on them.
      // Drop very old rows so polling doesn't toast historic events
      // when a player first opens the page.
      if (Date.now() - b.at > STALE_AFTER_MS) continue;
      // Skip pure no-ops (net = 0) so push/refund-style settlements
      // don't pop a meaningless toast.
      if (b.net === 0) continue;
      fresh.push({
        id: b.id,
        net: b.net,
        username: b.username,
        game: b.game,
        bornAt: Date.now(),
      });
    }
    if (fresh.length === 0) return;
    setToasts((prev) => [...prev, ...fresh]);
    // Schedule each new toast's removal independently. Doing it
    // per-toast (rather than one wide interval) keeps the unmount
    // tied to the same lifetime CSS uses for the fade.
    fresh.forEach((t) => {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, TOAST_LIFE_MS);
    });
  }, [bets]);

  // Trim the seen-set every minute so it can't grow without bound.
  useEffect(() => {
    const t = setInterval(() => {
      const ids = new Set(bets.map((b) => b.id));
      const next = new Set<string>();
      for (const id of seenRef.current) if (ids.has(id)) next.add(id);
      seenRef.current = next;
    }, 60_000);
    return () => clearInterval(t);
  }, [bets]);

  if (toasts.length === 0) return null;
  return (
    <div
      className="big-event-toast-stack"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 95,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const win = t.net > 0;
        return (
          <div
            key={t.id}
            className="big-event-toast"
            style={{
              background: win ? "var(--cactus-500)" : "var(--crimson-500)",
              color: "#fff",
              border: "3px solid var(--ink-900)",
              padding: "var(--sp-2) var(--sp-3)",
              fontFamily: "var(--font-display)",
              fontSize: 13,
              minWidth: 180,
              boxShadow: "var(--sh-card-rest)",
              animation: `big-event-toast-life ${TOAST_LIFE_MS}ms forwards`,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.9, letterSpacing: "var(--ls-loose)", textTransform: "uppercase" }}>
              {t.username} · {t.game}
            </div>
            <div style={{ fontSize: 18, marginTop: 2, textShadow: "1px 1px 0 var(--ink-900)" }}>
              {win ? "+" : ""}{t.net.toLocaleString()} ¢
            </div>
          </div>
        );
      })}
    </div>
  );
}
