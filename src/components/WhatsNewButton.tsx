"use client";

import { useEffect, useState } from "react";
import { CHANGELOG } from "@/lib/changelog";
import { WHATS_NEW_OPEN_EVENT, WHATS_NEW_SEEN_KEY } from "@/components/WhatsNewModal";

// Header button that re-opens the patch-notes modal on demand.
// Shows a small notification dot when there's an unread changelog
// entry (the auto-popup may have been dismissed earlier without
// reading; or older players who never saw the dialog still get
// the cue). Click dispatches WHATS_NEW_OPEN_EVENT — WhatsNewModal
// listens and force-opens.

export function WhatsNewButton() {
  const latestId = CHANGELOG[0]?.id ?? null;
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!latestId) return;
    const refresh = () => {
      try {
        const seen = localStorage.getItem(WHATS_NEW_SEEN_KEY);
        setHasUnread(seen !== latestId);
      } catch { /* private mode */ }
    };
    refresh();
    // Pick up "seen" updates from inside the same tab (modal
    // dismiss) and from other tabs (storage event).
    const onSeen = () => refresh();
    window.addEventListener("lg:whats-new-seen", onSeen);
    window.addEventListener("storage", onSeen);
    return () => {
      window.removeEventListener("lg:whats-new-seen", onSeen);
      window.removeEventListener("storage", onSeen);
    };
  }, [latestId]);

  function open() {
    window.dispatchEvent(new Event(WHATS_NEW_OPEN_EVENT));
  }

  return (
    <button
      type="button"
      onClick={open}
      className="whats-new-btn"
      aria-label="What's new"
      title="What's new — patch notes"
      style={{
        position: "relative",
        background: hasUnread ? "var(--gold-300)" : "transparent",
        color: hasUnread ? "var(--ink-900)" : "var(--gold-300)",
        border: `2px solid ${hasUnread ? "var(--ink-900)" : "var(--saddle-300)"}`,
        padding: "4px 10px",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontSize: 12,
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        boxShadow: hasUnread ? "0 0 10px rgba(255,196,64,0.5)" : undefined,
        animation: hasUnread ? "whats-new-pulse 1.6s ease-in-out infinite" : undefined,
      }}
    >
      ✦ What&rsquo;s New
      {hasUnread && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: "var(--crimson-500)",
            border: "2px solid var(--ink-900)",
            boxShadow: "0 0 6px rgba(255, 85, 68, 0.85)",
          }}
        />
      )}
      <style>{`
        @keyframes whats-new-pulse {
          0%, 100% { box-shadow: 0 0 10px rgba(255,196,64,0.5); }
          50%      { box-shadow: 0 0 18px rgba(255,196,64,0.95); }
        }
      `}</style>
    </button>
  );
}
