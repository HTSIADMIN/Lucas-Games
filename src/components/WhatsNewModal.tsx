"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export const WHATS_NEW_SEEN_KEY = "lg-whats-new-seen";
const SEEN_KEY = WHATS_NEW_SEEN_KEY;
/** Window event for force-opening the modal from the header button —
 *  matches the lg:open-free-games pattern so we don't need to lift
 *  modal state into a provider. */
export const WHATS_NEW_OPEN_EVENT = "lg:open-whats-new";

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

  // Allow the WhatsNewButton in the SiteHeader to force-open the
  // modal at any time, even after the player has dismissed the
  // auto-popup. Stays mounted while AppLive is mounted.
  useEffect(() => {
    function onOpen() {
      setShowHistory(false);
      setOpen(true);
    }
    window.addEventListener(WHATS_NEW_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WHATS_NEW_OPEN_EVENT, onOpen);
  }, []);

  function dismiss() {
    if (latest) {
      try {
        localStorage.setItem(SEEN_KEY, latest.id);
        // Tell the WhatsNewButton its dot can clear without waiting
        // for a remount — same store, but custom event for in-tab.
        window.dispatchEvent(new Event("lg:whats-new-seen"));
      } catch { /* ignore */ }
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
          style={{
            fontSize: 12,
            textAlign: "center",
            marginBottom: "var(--sp-4)",
            color: "var(--parchment-100)",
            letterSpacing: "var(--ls-loose)",
            fontFamily: "var(--font-display)",
          }}
        >
          v{latest.version} &middot; {formatDate(latest.date)}
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
          style={{ justifyContent: "center", marginTop: "var(--sp-4)", gap: "var(--sp-2)", flexWrap: "wrap" }}
        >
          <Link
            href="/earn/penny-pinchers"
            onClick={dismiss}
            className="btn btn-primary"
            style={{ textDecoration: "none" }}
          >
            ✦ Play Penny Pinchers
          </Link>
          <button type="button" className="btn btn-ghost" onClick={dismiss}>
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
        // Force ink-on-light here so notes stay readable on every theme
        // (panel-wood flips foreground to parchment on dark themes,
        // which would otherwise wash these bullets out on the gold/
        // parchment backing).
        color: "var(--ink-900)",
      }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}
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
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            color: "var(--saddle-400)",
            whiteSpace: "nowrap",
          }}
        >
          v{entry.version} &middot; {formatDate(entry.date)}
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, color: "var(--ink-900)" }}>
        {entry.notes.map((note, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              lineHeight: 1.45,
              marginBottom: 4,
              color: "var(--ink-900)",
            }}
          >
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
