"use client";

import { ACHIEVEMENTS, type AchievementId } from "@/lib/games/penny-pinchers/catalog";

export function AchievementsPanel({
  unlocked,
}: {
  unlocked: Set<AchievementId>;
}) {
  const completed = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
  return (
    <div className="stack" style={{ gap: "var(--sp-2)", overflowY: "auto", maxHeight: 480 }}>
      <div
        className="text-mute"
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          paddingLeft: 4,
        }}
      >
        {completed} / {ACHIEVEMENTS.length} unlocked
      </div>
      {/* Unlocked trophies sink to the bottom — the player's targets
          (still locked) stay at the top so progress remains visible. */}
      {ACHIEVEMENTS.slice().sort((a, b) => {
        const aGot = unlocked.has(a.id);
        const bGot = unlocked.has(b.id);
        if (aGot !== bGot) return aGot ? 1 : -1;
        return 0;
      }).map((a) => {
        const got = unlocked.has(a.id);
        return (
          <div
            key={a.id}
            style={{
              background: got ? "var(--gold-100)" : "var(--parchment-200)",
              border: `2px solid ${got ? "var(--gold-300)" : "var(--saddle-300)"}`,
              padding: "8px 10px",
              opacity: got ? 1 : 0.7,
              color: "var(--ink-900)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 13,
                  color: "var(--ink-900)",
                  textDecoration: got ? "none" : "line-through",
                }}
              >
                {got ? "✓ " : ""}
                {a.label}
              </span>
              {a.reward > 0 ? (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    color: got ? "var(--gold-500)" : "var(--saddle-400)",
                  }}
                >
                  {a.reward} ★
                </span>
              ) : null}
            </div>
            <div className="text-mute" style={{ fontSize: 11 }}>
              {a.description}
            </div>
          </div>
        );
      })}
    </div>
  );
}
