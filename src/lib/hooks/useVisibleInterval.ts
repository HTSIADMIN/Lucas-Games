"use client";

import { useEffect, useRef } from "react";

// Drop-in replacement for the `fn(); setInterval(fn, ms)` pattern.
// Skips ticks while the tab is hidden so a forgotten tab doesn't keep
// hammering /api routes for hours, and refires `fn` immediately when
// the user comes back (or on mount) so the UI catches up to current
// state.
//
// Pass `ms <= 0` (or `null`) to disable. The latest `fn` reference is
// always called, so callers can close over fresh state without having
// to thread it through deps.
export function useVisibleInterval(fn: () => void, ms: number | null): void {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    if (ms == null || ms <= 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fire = () => { if (!cancelled) fnRef.current(); };
    const start = () => {
      if (timer != null) return;
      timer = setInterval(fire, ms);
    };
    const stop = () => {
      if (timer == null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        stop();
      } else {
        // Catch up immediately so the user sees fresh state on return,
        // then re-arm the interval from "now" rather than carrying any
        // half-elapsed tick from before they left.
        fire();
        start();
      }
    };

    if (typeof document === "undefined" || !document.hidden) {
      // Fire-on-mount so this hook fully replaces the
      // `fn(); setInterval(fn, ms)` pair callers used to write inline.
      fire();
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      cancelled = true;
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [ms]);
}
