"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";
import { formatAmount, splitFormatted, tierColor, tierSuffix } from "@/lib/format";
import { ProfileModal } from "@/components/social/ProfileModal";
import {
  useCatchMeChipHidden,
  useCatchMeToastSuppressed,
} from "@/lib/preferences";

// "Catch-me chip" — header pill that always points at the player one
// rank above the current user, showing how many coins to catch them.
// When the user passes that target the chip flashes "Passed!" for ~2s
// then retargets the new rival. When the user is #1 it flips to a
// gold champion badge with a "holding for Nd / Nh / Nm" streak.
//
// A second-card lost-rank toast slides in from the right when the
// user is overtaken, throttled to at most one toast per snapshot
// poll. Both surfaces share the snapshot.competitive block.
//
// Toggle: small arrow button on the chip; the player can hide it
// (preference persists in localStorage via src/lib/preferences.ts).
// When hidden the chip collapses to a single arrow pill that
// re-expands on click. Toast is independent — opting out of the chip
// doesn't disable the "Bob just passed you" alert.

function relativeChampionStreak(since: string | null): string | null {
  if (!since) return null;
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return null;
  const dt = Math.max(0, Date.now() - t);
  const m = Math.floor(dt / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function TieredAmount({ value }: { value: number }) {
  const s = formatAmount(value);
  const { lead, suffix } = splitFormatted(s);
  return (
    <span>
      {lead}
      <span style={{ color: tierColor(tierSuffix(value)), marginLeft: 1 }}>
        {suffix}
      </span>
    </span>
  );
}

export function CompetitiveChip() {
  const { snapshot } = useAppSnapshot();
  const [hidden, setHidden] = useCatchMeChipHidden();
  const [toastSuppressed, setToastSuppressed] = useCatchMeToastSuppressed();
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  // Pass celebration state — when the user's rank improves, freeze
  // the previous rival's name and flash for ~2s before retargeting.
  const [pass, setPass] = useState<{ name: string; gap: number } | null>(null);
  const prevRankRef = useRef<number | null>(null);
  const prevRivalIdRef = useRef<string | null>(null);
  const prevBalanceRef = useRef<number>(0);

  // Lost-rank toast state — fires once per snapshot when the user's
  // rank gets worse. Throttled by a ref (cleared after dismiss /
  // auto-dismiss).
  const [toast, setToast] = useState<{ name: string; gap: number } | null>(null);
  const lastToastAtRef = useRef<number>(0);

  // Detect rank crossings on every snapshot tick.
  useEffect(() => {
    const comp = snapshot?.competitive;
    if (!comp) return;
    const prevRank = prevRankRef.current;
    const newRank = comp.myRank;
    const prevRivalId = prevRivalIdRef.current;
    const newRivalId = comp.rival?.userId ?? null;

    if (prevRank != null && newRank != null) {
      // Improved (smaller rank number = closer to #1). Pass celebrate
      // if we crossed a real opponent — i.e. the rival id changed.
      if (newRank < prevRank && prevRivalId && prevRivalId !== newRivalId) {
        // We need a name for the previous rival to celebrate against,
        // but the snapshot doesn't carry the previous one anymore.
        // Best effort: reuse the prev rival's last-known username if
        // it's still cached on the snapshot side (it isn't here),
        // otherwise show a generic "Passed your rival!" message.
        const lastName = passNameCacheRef.current.get(prevRivalId) ?? "your rival";
        const gap = comp.myBalance - prevBalanceRef.current;
        setPass({ name: lastName, gap: Math.max(0, gap) });
      }
      // Dropped → fire the lost-rank toast.
      if (newRank > prevRank && !toastSuppressed) {
        const now = Date.now();
        if (now - lastToastAtRef.current > 4500) {
          // The chip carries the rival; for "who passed me" we need
          // a name. The new rival (one above me) is the most likely
          // candidate. If we can't identify, fall back to "someone".
          const passer = comp.rival?.username ?? "Someone";
          const gap = comp.rival?.gap ?? 0;
          setToast({ name: passer, gap });
          lastToastAtRef.current = now;
        }
      }
    }

    prevRankRef.current = newRank;
    prevRivalIdRef.current = newRivalId;
    prevBalanceRef.current = comp.myBalance;
    if (comp.rival) {
      passNameCacheRef.current.set(comp.rival.userId, comp.rival.username);
    }
  }, [snapshot, toastSuppressed]);

  // Pass celebration auto-dismiss after 2s.
  useEffect(() => {
    if (!pass) return;
    const t = setTimeout(() => setPass(null), 2200);
    return () => clearTimeout(t);
  }, [pass]);

  // Toast auto-dismiss after 5s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Champion-streak ticking — re-render once a minute when in champion
  // mode so the "for 47m" string keeps current. Cheap (a setState).
  const [, forceTick] = useState(0);
  useEffect(() => {
    const comp = snapshot?.competitive;
    if (!comp || comp.rival || comp.myRank !== 1) return;
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [snapshot]);

  if (!snapshot?.competitive) return null;
  const comp = snapshot.competitive;
  // Hide entirely for players who aren't on the leaderboard yet (no
  // balance, never played) — there's nothing useful to show.
  if (comp.myRank == null) return null;

  function toggleHidden() {
    setHidden(!hidden);
  }
  function dismissToastForever() {
    setToast(null);
    setToastSuppressed(true);
  }

  // -------------------------------------------------------------
  // Chip rendering
  // -------------------------------------------------------------
  const isChampion = comp.myRank === 1;
  const championDuration = isChampion ? relativeChampionStreak(comp.championSince) : null;

  let chip: React.ReactNode = null;
  if (hidden) {
    chip = (
      <button
        type="button"
        className="catch-me-chip catch-me-chip-collapsed"
        onClick={toggleHidden}
        title="Show catch-me chip"
        aria-label="Show catch-me chip"
      >
        ⮞
      </button>
    );
  } else if (pass) {
    chip = (
      <div className="catch-me-chip catch-me-chip-pass">
        <span style={{ marginRight: 6 }}>✓</span>
        <span style={{ fontWeight: 600 }}>Passed {pass.name}!</span>
        {pass.gap > 0 && (
          <span style={{ marginLeft: 6, opacity: 0.85 }}>
            +<TieredAmount value={pass.gap} /> ahead
          </span>
        )}
      </div>
    );
  } else if (isChampion) {
    chip = (
      <button
        type="button"
        className="catch-me-chip catch-me-chip-champion"
        onClick={() => (window.location.href = "/leaderboard")}
        title="You are #1. Click to view the leaderboard."
      >
        <span style={{ marginRight: 6 }}>👑</span>
        <span style={{ fontWeight: 600 }}>Champion</span>
        {championDuration && (
          <span style={{ marginLeft: 6, opacity: 0.85 }}>
            · holding #1 for {championDuration}
          </span>
        )}
        <span
          className="catch-me-chip-toggle"
          role="button"
          aria-label="Hide catch-me chip"
          onClick={(e) => {
            e.stopPropagation();
            toggleHidden();
          }}
        >
          ⮜
        </span>
      </button>
    );
  } else if (comp.rival) {
    const rival = comp.rival;
    chip = (
      <div className="catch-me-chip">
        <span style={{ marginRight: 6 }}>↑</span>
        <button
          type="button"
          className="catch-me-chip-name"
          onClick={() => setOpenUserId(rival.userId)}
          title={`Open ${rival.username}'s profile`}
        >
          {rival.username}
        </button>
        <span style={{ marginLeft: 6 }}>
          · <TieredAmount value={rival.gap} /> to catch
        </span>
        <span
          className="catch-me-chip-toggle"
          role="button"
          aria-label="Hide catch-me chip"
          onClick={toggleHidden}
        >
          ⮜
        </span>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Lost-rank toast
  // -------------------------------------------------------------
  const toastNode = toast ? (
    <div className="catch-me-toast" role="status" aria-live="polite">
      <div className="catch-me-toast-body">
        <b>{toast.name}</b> just passed you
        {toast.gap > 0 && (
          <span style={{ marginLeft: 4, opacity: 0.85 }}>
            · <TieredAmount value={toast.gap} /> behind
          </span>
        )}
      </div>
      <button
        type="button"
        className="catch-me-toast-close"
        onClick={() => setToast(null)}
        aria-label="Dismiss"
        title="Dismiss"
      >
        ×
      </button>
      <button
        type="button"
        className="catch-me-toast-mute"
        onClick={dismissToastForever}
        title="Hide future rank-drop alerts"
      >
        Don&apos;t show again
      </button>
    </div>
  ) : null;

  return (
    <>
      {chip}
      {toastNode}
      {openUserId && <ProfileModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </>
  );
}

// Module-level cache that maps a recently-seen rival id → username,
// so the pass-celebration can name the player we just overtook even
// though that user is no longer in the snapshot.competitive.rival
// slot at the moment of crossing.
const passNameCacheRef: { current: Map<string, string> } = { current: new Map() };
