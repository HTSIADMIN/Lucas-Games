"use client";

import { AnimatedBalance } from "@/components/AnimatedBalance";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";

// Live balance pill. Reads its number from AppSnapshotProvider's
// 10s combined poll instead of running its own /api/wallet/balance
// fetch every 3s. Falls back to the SSR `initial` value while the
// first snapshot poll lands.

export function LiveBalance({
  initial,
  className,
  style,
  suffix = " ¢",
}: {
  initial: number;
  className?: string;
  style?: React.CSSProperties;
  /** @deprecated retained for call-site compatibility — polling lives in AppSnapshotProvider now. */
  pollMs?: number;
  suffix?: string;
}) {
  const { snapshot } = useAppSnapshot();
  const balance = snapshot?.balance ?? initial;
  return (
    <AnimatedBalance value={balance} suffix={suffix} className={className} style={style} />
  );
}
