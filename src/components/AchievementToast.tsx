"use client";

import { useEffect, useState } from "react";
import { ACHIEVEMENT_UNLOCK_EVENT, type AchievementUnlockedKey } from "@/lib/achievements/events";
import { getAchievementDef, rarityColor } from "@/lib/achievements/registry";
import * as Sfx from "@/lib/sfx";

type ToastEntry = AchievementUnlockedKey & { key: number };

// Global achievement-unlock toast. Mounted once inside <AppLive> at
// the authed-shell root. Listens for `lg:achievement-unlocked`
// window events (see src/lib/achievements/events.ts) and pops a
// celebratory ribbon for each new unlock. Stacks multiple unlocks
// vertically when several land at once.
//
// Toasts auto-dismiss after 6 seconds; click dismisses early.
const TOAST_LIFETIME_MS = 6000;

export function AchievementToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    let counter = 0;
    function onUnlock(e: Event) {
      const ce = e as CustomEvent<AchievementUnlockedKey[]>;
      if (!Array.isArray(ce.detail) || ce.detail.length === 0) return;
      // De-dup against currently-rendered toasts so a single unlock
      // doesn't double-up if two routes echo it (rare but possible).
      setToasts((prev) => {
        const seen = new Set(prev.map((t) => `${t.source}:${t.id}`));
        const fresh = ce.detail
          .filter((u) => !seen.has(`${u.source}:${u.id}`))
          .map((u) => ({ ...u, key: ++counter }));
        if (fresh.length === 0) return prev;
        // Play a sound for the first new one — multiple unlocks in
        // one event are common but one ding is enough.
        try { Sfx.play("win.levelup"); } catch { /* sfx not ready */ }
        return [...prev, ...fresh];
      });
    }
    window.addEventListener(ACHIEVEMENT_UNLOCK_EVENT, onUnlock as EventListener);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCK_EVENT, onUnlock as EventListener);
  }, []);

  // Auto-dismiss — each toast carries its own timer keyed by its
  // unique counter id.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.key !== t.key));
      }, TOAST_LIFETIME_MS),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="achievement-toast-stack" aria-live="polite">
      {toasts.map((t) => {
        const def = getAchievementDef(t.source, t.id);
        return (
          <button
            key={t.key}
            type="button"
            className={`achievement-toast achievement-toast-${def.rarity}`}
            style={{ borderColor: rarityColor(def.rarity) }}
            onClick={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))}
            title="Click to dismiss"
            aria-label={`Achievement unlocked: ${def.label}`}
          >
            <span className="achievement-toast-icon" aria-hidden>
              {def.icon}
            </span>
            <div className="achievement-toast-body">
              <div className="achievement-toast-eyebrow">Achievement unlocked!</div>
              <div className="achievement-toast-label">{def.label}</div>
              {def.description && (
                <div className="achievement-toast-desc">{def.description}</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
