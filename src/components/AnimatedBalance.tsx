"use client";

import { useEffect, useRef, useState } from "react";

// Smoothly counts the displayed balance from its previous value to
// the new target whenever `value` changes. Used in place of the
// static balance number in the lobby + game header so wins and
// losses tick visibly. Tween length scales loosely with the size of
// the change so a 100¢ tick doesn't drag and a 5M¢ jackpot doesn't
// spam frames.

type Props = {
  value: number;
  /** Optional rendered text wrapper, e.g. " ¢" or "x". */
  suffix?: string;
  /** Min animation duration in ms. */
  minMs?: number;
  /** Max animation duration in ms. */
  maxMs?: number;
  /** Class applied to the rendered span; defaults to none so the
   *  parent can style the text. */
  className?: string;
  /** Inline style passthrough. The component adds a transient
   *  color flash when the balance changes (green up, red down)
   *  but otherwise honors whatever you pass. */
  style?: React.CSSProperties;
};

const FLASH_MS = 600;

export function AnimatedBalance({
  value,
  suffix = "",
  minMs = 350,
  maxMs = 1100,
  className,
  style,
}: Props) {
  const [display, setDisplay] = useState<number>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const fromRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const diff = Math.abs(to - from);
    // Scale ~1ms per 1k coins, clamped. Big swings get a longer
    // count, tiny ones snap fast.
    const ms = Math.max(minMs, Math.min(maxMs, 200 + diff / 1000));
    const start = performance.now();
    setFlash(to > from ? "up" : "down");
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    function step(now: number) {
      const t = Math.min(1, (now - start) / ms);
      // Ease-out quad — fast at start, settles into the final value.
      const eased = 1 - (1 - t) * (1 - t);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        fromRef.current = to;
        setDisplay(to);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    const flashT = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.clearTimeout(flashT);
    };
  }, [value, minMs, maxMs]);

  const flashStyle: React.CSSProperties = flash === "up"
    ? { color: "var(--cactus-500)", transition: "color 0.5s ease-out" }
    : flash === "down"
    ? { color: "var(--crimson-500)", transition: "color 0.5s ease-out" }
    : { transition: "color 0.5s ease-out" };

  return (
    <span className={className} style={{ ...style, ...flashStyle }}>
      {display.toLocaleString()}{suffix}
    </span>
  );
}
