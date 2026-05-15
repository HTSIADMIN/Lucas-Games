"use client";

import { useState } from "react";
import { getAchievementDef, rarityColor } from "@/lib/achievements/registry";

function relativeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const dt = Math.max(0, Date.now() - t);
  const m = Math.floor(dt / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export function AchievementBadge({
  source,
  id,
  unlockedAt,
}: {
  source: string;
  id: string;
  unlockedAt: string;
}) {
  const def = getAchievementDef(source, id);
  const [showTip, setShowTip] = useState(false);
  const border = rarityColor(def.rarity);
  return (
    <div
      className={`achievement-badge achievement-badge-${def.rarity}`}
      style={{ borderColor: border }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
      tabIndex={0}
      role="button"
      aria-label={`${def.label} achievement — ${def.description}`}
    >
      <span className="achievement-badge-icon" aria-hidden>
        {def.icon}
      </span>
      <span className="achievement-badge-label">{def.label}</span>
      <span className="achievement-badge-time">{relativeAgo(unlockedAt)}</span>
      {showTip && (
        <span className="achievement-badge-tooltip" role="tooltip">
          <b>{def.label}</b>
          {def.description && <span>{def.description}</span>}
        </span>
      )}
    </div>
  );
}
