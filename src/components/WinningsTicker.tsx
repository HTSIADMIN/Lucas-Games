"use client";

import { useState } from "react";
import { useAppSnapshot, type WinningsWindow } from "@/components/AppSnapshotProvider";
import { formatAmount, splitFormatted, tierColor, tierSuffix } from "@/lib/format";

// Two stacked chips that show the player's net winnings for today
// and this week. Tucks directly under the header balance pill.
// Tap (or hover on desktop) → tooltip with the bet/won/net
// breakdown for that window. Reads `snapshot.winnings` from the
// shared snapshot context — no own fetch.

function NetText({ net }: { net: number }) {
  const sign = net > 0 ? "+" : net < 0 ? "−" : "";
  const v = Math.abs(net);
  const s = formatAmount(v);
  const { lead, suffix } = splitFormatted(s);
  // Crimson for losses, cactus for wins, ink for flat.
  const color = net > 0 ? "var(--cactus-700)" : net < 0 ? "var(--crimson-500)" : "var(--ink-900)";
  return (
    <span style={{ color, fontWeight: 600 }}>
      {sign}
      {lead}
      <span style={{ color: tierColor(tierSuffix(v)), marginLeft: 1 }}>{suffix}</span>
    </span>
  );
}

function Tooltip({
  label,
  w,
}: {
  label: string;
  w: WinningsWindow;
}) {
  return (
    <div className="winnings-tooltip" role="tooltip">
      <b>{label}</b>
      <div>
        bet <span style={{ color: "var(--crimson-500)" }}>{formatAmount(w.bet)}</span>
        {"  ·  "}won <span style={{ color: "var(--cactus-700)" }}>{formatAmount(w.won)}</span>
      </div>
      <div>
        net <NetText net={w.net} />
      </div>
    </div>
  );
}

function Chip({
  period,
  label,
  w,
}: {
  period: "today" | "week";
  label: string;
  w: WinningsWindow;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="winnings-chip"
      data-period={period}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-label={`${label} net winnings`}
    >
      <NetText net={w.net} />
      <span className="winnings-chip-period">{label}</span>
      {open && <Tooltip label={label} w={w} />}
    </button>
  );
}

export function WinningsTicker() {
  const { snapshot } = useAppSnapshot();
  if (!snapshot?.winnings) return null;
  const { today, week } = snapshot.winnings;
  // Hide entirely if there's literally no activity in either window —
  // a brand-new player shouldn't see a meaningless "0 today" pill.
  if (today.bet === 0 && week.bet === 0) return null;
  return (
    <div className="winnings-ticker" aria-label="Daily and weekly winnings">
      <Chip period="today" label="today" w={today} />
      <Chip period="week" label="this week" w={week} />
    </div>
  );
}
