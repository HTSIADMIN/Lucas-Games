"use client";

import { useEffect, useState } from "react";

// Slim banner that pins to the top of every authed page when a
// global event (e.g. Lucky Hour) is active. Silent — and unmounted
// — when no event is running.

type ActiveEvent = {
  kind: "lucky_hour";
  multiplier: number;
  endsAt: number;
  title: string;
  blurb: string;
};

export function EventTicker() {
  const [event, setEvent] = useState<ActiveEvent | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/events/active");
        if (!r.ok) return;
        const d = (await r.json()) as { event: ActiveEvent | null };
        if (cancelled) return;
        setEvent(d.event);
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  // Tick once a second so the countdown re-renders.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!event) return null;
  const remaining = event.endsAt - Date.now();
  if (remaining <= 0) return null;
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 90,
        background: "linear-gradient(90deg, var(--gold-300), var(--neon-gold), var(--gold-300))",
        backgroundSize: "200% 100%",
        color: "var(--ink-900)",
        fontFamily: "var(--font-display)",
        textAlign: "center",
        padding: "6px 12px",
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        borderBottom: "3px solid var(--ink-900)",
        animation: "event-ticker-shine 4s linear infinite, game-event-pulse 1.6s ease-in-out infinite",
        textShadow: "1px 1px 0 var(--gold-100)",
        fontSize: 13,
      }}
    >
      <span aria-hidden style={{ marginRight: 8 }}>★</span>
      <b>{event.title}</b> · {event.blurb} · ends in {m}:{String(s).padStart(2, "0")}
      <span aria-hidden style={{ marginLeft: 8 }}>★</span>
      <style>{`
        @keyframes event-ticker-shine {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
}
