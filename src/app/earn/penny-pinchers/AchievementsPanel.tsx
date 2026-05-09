"use client";

import { ACHIEVEMENTS, type AchievementId } from "@/lib/games/penny-pinchers/catalog";

export function AchievementsPanel({
  unlocked,
}: {
  unlocked: Set<AchievementId>;
}) {
  const completed = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
  return (
    <div className="stack pp-shop-scroll" style={{ gap: "var(--sp-2)" }}>
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
              background: got ? "var(--surface-highlight)" : "var(--parchment-200)",
              border: `3px solid ${got ? "var(--gold-300)" : "var(--saddle-300)"}`,
              padding: "12px 14px",
              opacity: got ? 1 : 0.85,
              color: "var(--ink-900)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  color: "var(--ink-900)",
                  lineHeight: 1.15,
                }}
              >
                {got ? "✓ " : ""}
                {a.label}
              </span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
                {a.reward > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      color: got ? "var(--ink-900)" : "var(--saddle-400)",
                      background: got ? "var(--gold-300)" : "var(--parchment-50)",
                      border: "2px solid var(--ink-900)",
                      padding: "2px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.reward} ★
                  </span>
                )}
                {a.frugalityReward && a.frugalityReward > 0 ? (
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      color: "var(--parchment-50)",
                      background: "var(--cactus-500)",
                      border: "2px solid var(--ink-900)",
                      padding: "2px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    +{a.frugalityReward} F
                  </span>
                ) : null}
              </span>
            </div>
            <div className="text-mute" style={{ fontSize: 13, lineHeight: 1.35, color: "var(--saddle-500)" }}>
              {a.description}
            </div>
            {got && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  letterSpacing: "var(--ls-loose)",
                  textTransform: "uppercase",
                  color: "var(--cactus-500)",
                }}
              >
                ✦ Unlocked
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
