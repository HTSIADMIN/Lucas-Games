"use client";

import Link from "next/link";
import { useState } from "react";
import { AchievementBadge } from "@/components/AchievementBadge";

export type AchievementUnlock = {
  source: string;
  achievementId: string;
  unlockedAt: string; // ISO
};

// Trophies strip rendered inside ProfileModal between the cosmetics
// row and the wallet history panel. Shows the most-recent 5 unlocks
// + a total-count chip; "See all" expands inline to a scrollable
// grid of every unlock.
//
// Empty state: directs the visitor to Penny Pinchers (the only
// source of unlocks today).

export function AchievementShowcase({
  total,
  recent,
  /** When true, render the panel even if `recent` is empty, with a
   *  "no trophies yet" CTA. False when looking at another player —
   *  hide the strip to keep the modal compact. */
  showEmpty = true,
}: {
  total: number;
  recent: AchievementUnlock[];
  showEmpty?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (total === 0 && recent.length === 0) {
    if (!showEmpty) return null;
    return (
      <section className="achievement-showcase achievement-showcase-empty">
        <header>
          <h3>Trophies</h3>
        </header>
        <p className="text-mute" style={{ marginBottom: "var(--sp-2)" }}>
          No trophies yet — go grab some!
        </p>
        <Link href="/earn/penny-pinchers" className="btn btn-sm btn-ghost">
          Open Penny Pinchers →
        </Link>
      </section>
    );
  }

  return (
    <section className="achievement-showcase">
      <header className="achievement-showcase-header">
        <h3>Trophies</h3>
        <span className="text-mute" style={{ fontSize: 12 }}>
          {total} unlocked
        </span>
      </header>
      <div className="achievement-strip">
        {(expanded ? recent : recent.slice(0, 5)).map((u) => (
          <AchievementBadge
            key={`${u.source}:${u.achievementId}`}
            source={u.source}
            id={u.achievementId}
            unlockedAt={u.unlockedAt}
          />
        ))}
      </div>
      {!expanded && total > recent.length && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setExpanded(true)}
          style={{ marginTop: "var(--sp-2)" }}
        >
          See all {total} →
        </button>
      )}
    </section>
  );
}
