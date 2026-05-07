"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Auto-logout for users who leave the tab open but stop interacting
// (the worst case for our /api polling — a forgotten browser tab can
// otherwise hammer the database for days). After IDLE_BEFORE_WARN_MS
// of no input, we show a "Still there?" modal with a countdown; if
// they don't dismiss it within WARN_DURATION_MS, we hit the logout
// endpoint and bounce them to /sign-in.
//
// Activity is sampled cheaply: each tracked event just stamps a ref;
// a 5s tick compares `Date.now() - lastActivity` against thresholds.
// Timer runs independent of visibility — a hidden, idle tab is the
// scenario we most want to cull.
//
// `mousemove` is intentionally NOT in the activity list. It's far too
// sensitive — a stationary cursor + browser-driven micro-events keep
// the timer fresh forever, which is exactly how a real player's tab
// stayed "active" for a full day. Real engagement produces keydown/
// touchstart/click; a player who hasn't done one of those in 10 min
// has stepped away.

const IDLE_BEFORE_WARN_MS = 10 * 60_000; // 10 min of no activity → warn
const WARN_DURATION_MS = 5 * 60_000;     // 5 more min → auto sign-out
const CHECK_INTERVAL_MS = 5_000;

const ACTIVITY_EVENTS = ["keydown", "touchstart", "click"] as const;

type Phase = "active" | "warning" | "logging-out";

export function IdleTimeout() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("active");
  const [warnSecondsLeft, setWarnSecondsLeft] = useState(
    Math.floor(WARN_DURATION_MS / 1000),
  );

  useEffect(() => {
    let lastActivity = Date.now();
    let warningStartedAt: number | null = null;

    const onActivity = () => {
      lastActivity = Date.now();
      // Any input while the warning is up dismisses it.
      if (warningStartedAt != null) {
        warningStartedAt = null;
        setPhase("active");
      }
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const tick = setInterval(() => {
      const idleMs = Date.now() - lastActivity;
      if (warningStartedAt == null) {
        if (idleMs >= IDLE_BEFORE_WARN_MS) {
          warningStartedAt = Date.now();
          setWarnSecondsLeft(Math.floor(WARN_DURATION_MS / 1000));
          setPhase("warning");
        }
      } else {
        const warnElapsed = Date.now() - warningStartedAt;
        const remaining = WARN_DURATION_MS - warnElapsed;
        if (remaining <= 0) {
          // Stop the tick to prevent re-entry while the network call runs.
          warningStartedAt = null;
          setPhase("logging-out");
          fetch("/api/auth/logout", { method: "POST" })
            .catch(() => { /* non-fatal — we're navigating regardless */ })
            .finally(() => {
              router.push("/sign-in");
              router.refresh();
            });
        } else {
          setWarnSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(tick);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [router]);

  if (phase === "active") return null;

  const mm = Math.floor(warnSecondsLeft / 60);
  const ss = warnSecondsLeft % 60;
  const countdown = `${mm}:${ss.toString().padStart(2, "0")}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inactive session warning"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10_000,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        padding: "var(--sp-3, 16px)",
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: 440,
          width: "100%",
          padding: "var(--sp-4, 24px)",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 12 }}>Still there?</h2>
        <p style={{ margin: 0, marginBottom: 8 }}>
          You&rsquo;ve been inactive for a while. We&rsquo;ll sign you out in
          {" "}
          <strong>{countdown}</strong> to free up server resources.
        </p>
        <p style={{ margin: 0, marginBottom: 20, fontSize: 13, opacity: 0.75 }}>
          {phase === "logging-out" ? "Signing you out…" : "Press any key or click anywhere to stay signed in."}
        </p>
        <button
          className="btn btn-primary"
          disabled={phase === "logging-out"}
          onClick={() => {
            // The activity listener will also fire from the click, but
            // making this explicit keeps the dismiss path obvious.
            setPhase("active");
          }}
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
