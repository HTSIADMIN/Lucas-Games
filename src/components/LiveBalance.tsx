"use client";

import { useEffect, useState } from "react";
import { AnimatedBalance } from "@/components/AnimatedBalance";

// Live balance pill. Hydrates from the server-rendered initial
// value, then polls /api/wallet/balance every few seconds so the
// number ticks up/down without a full page refresh. Wraps the
// AnimatedBalance counter so the change tweens visibly.

export function LiveBalance({
  initial,
  className,
  style,
  pollMs = 3000,
  suffix = " ¢",
}: {
  initial: number;
  className?: string;
  style?: React.CSSProperties;
  pollMs?: number;
  suffix?: string;
}) {
  const [balance, setBalance] = useState<number>(initial);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const r = await fetch("/api/wallet/balance");
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled || typeof d.balance !== "number") return;
        setBalance(d.balance);
      } catch { /* ignore */ }
    }
    fetchOnce();
    const t = setInterval(fetchOnce, pollMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [pollMs]);

  // Window-level event so game clients can shove a fresh balance
  // straight in without waiting for the next poll. Dispatched via
  // `window.dispatchEvent(new CustomEvent("lg:balance", { detail: n }))`.
  useEffect(() => {
    function onBalance(e: Event) {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === "number") setBalance(ce.detail);
    }
    window.addEventListener("lg:balance", onBalance as EventListener);
    return () => window.removeEventListener("lg:balance", onBalance as EventListener);
  }, []);

  return (
    <AnimatedBalance value={balance} suffix={suffix} className={className} style={style} />
  );
}
