"use client";

import { useEffect, useState } from "react";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";

// One-time release-notes modal. Pops the first time a player sees a
// changelog entry id they haven't acknowledged before. Latest note
// is shown front-and-centre; older notes are tucked behind a
// "Previous updates" toggle so the modal stays scannable.
//
// localStorage tracks the most recently *acknowledged* entry id —
// dismissing the modal stamps the latest id, so adding a new entry
// to changelog.ts is the trigger for the next pop. Players who've
// never seen the modal will see whatever the current latest entry
// is on their next page load.

const SEEN_KEY = "lg-whats-new-seen";

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const latest: ChangelogEntry | undefined = CHANGELOG[0];
  const older = CHANGELOG.slice(1);

  useEffect(() => {
    if (!latest) return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* private mode */ }
    if (seen !== latest.id) setOpen(true);
  }, [latest]);

  function dismiss() {
    if (latest) {
      try { localStorage.setItem(SEEN_KEY, latest.id); } catch { /* ignore */ }
    }
    setOpen(false);
  }

  if (!open || !latest) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9_400,
        background: "rgba(26,15,8,0.7)",
        display: "grid",
        placeItems: "center",
        padding: "var(--sp-3, 16px)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood"
        style={{
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
        }}
      >
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h3)",
            color: "var(--gold-300)",
            letterSpacing: "var(--ls-loose)",
            textShadow: "2px 2px 0 var(--ink-900)",
            marginBottom: "var(--sp-1)",
            textAlign: "center",
          }}
        >
          What&rsquo;s New
        </div>
        <div
          className="text-mute"
          style={{ fontSize: 12, textAlign: "center", marginBottom: "var(--sp-4)" }}
        >
          {formatDate(latest.date)}
        </div>

        <EntryBody entry={latest} highlight />

        {older.length > 0 && (
          <div style={{ marginTop: "var(--sp-4)" }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setShowHistory((v) => !v)}
              style={{ width: "100%" }}
            >
              {showHistory ? "Hide previous updates" : `Previous updates (${older.length})`}
            </button>
            {showHistory && (
              <div style={{ marginTop: "var(--sp-3)" }}>
                {older.map((entry) => (
                  <EntryBody key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="row"
          style={{ justifyContent: "center", marginTop: "var(--sp-4)" }}
        >
          <button type="button" className="btn btn-primary" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryBody({ entry, highlight = false }: { entry: ChangelogEntry; highlight?: boolean }) {
  return (
    <section
      style={{
        background: highlight ? "var(--gold-100)" : "var(--parchment-100)",
        border: `3px solid ${highlight ? "var(--gold-300)" : "var(--saddle-300)"}`,
        padding: "var(--sp-3)",
        marginBottom: "var(--sp-2)",
      }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-body-lg)",
            color: "var(--ink-900)",
          }}
        >
          {entry.title}
        </div>
        {!highlight && (
          <span className="text-mute" style={{ fontSize: 11 }}>
            {formatDate(entry.date)}
          </span>
        )}
      </div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {entry.notes.map((note, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 4 }}>
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(iso: string): string {
  // "2026-05-05" → "May 5, 2026". Falls back to the raw string if
  // the locale parser chokes (e.g. older mobile browsers).
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
