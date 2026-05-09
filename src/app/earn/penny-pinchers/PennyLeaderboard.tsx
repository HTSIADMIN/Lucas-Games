"use client";

import type { LeaderboardRow as Row } from "./PennyPinchersClient";

// Per-tier prestige-tag palettes. Each step covers 5 prestiges so
// the badge bumps up the rarity ladder as a player keeps cycling.
// All entries use ink-on-bright so the count + word both read.
const PRESTIGE_TAG_PALETTES: { bg: string; border: string; glow: string; fg: string }[] = [
  // 1–4 — saloon gold (the original)
  { bg: "linear-gradient(90deg, var(--gold-300), var(--gold-500), var(--gold-300))",
    border: "var(--ink-900)", glow: "rgba(255,196,64,0.55)", fg: "var(--ink-900)" },
  // 5–9 — emerald felt
  { bg: "linear-gradient(90deg, var(--cactus-300), #2f7a3d, var(--cactus-300))",
    border: "var(--ink-900)", glow: "rgba(80,210,120,0.55)", fg: "var(--ink-900)" },
  // 10–14 — saloon ruby
  { bg: "linear-gradient(90deg, var(--crimson-300), var(--crimson-500), var(--crimson-300))",
    border: "var(--ink-900)", glow: "rgba(232,80,80,0.55)", fg: "var(--parchment-50)" },
  // 15–19 — sky sapphire
  { bg: "linear-gradient(90deg, var(--sky-300), var(--sky-500), var(--sky-300))",
    border: "var(--ink-900)", glow: "rgba(95,168,211,0.55)", fg: "var(--ink-900)" },
  // 20–24 — royal amethyst
  { bg: "linear-gradient(90deg, #b178d8, #6a3aa6, #b178d8)",
    border: "var(--ink-900)", glow: "rgba(160,90,210,0.55)", fg: "var(--parchment-50)" },
  // 25+ — diamond / ink rainbow
  { bg: "linear-gradient(90deg, var(--gold-300), var(--cactus-300), var(--sky-300), #b178d8, var(--crimson-300), var(--gold-300))",
    border: "var(--ink-900)", glow: "rgba(255,232,168,0.7)", fg: "var(--ink-900)" },
];

function prestigeTagPalette(count: number) {
  const tier = Math.min(PRESTIGE_TAG_PALETTES.length - 1, Math.floor((count - 1) / 5));
  return PRESTIGE_TAG_PALETTES[tier];
}

// Top-10 panel rendered at the bottom of Penny Pinchers. Rows are
// passed in from the parent's /state poll — no separate fetch — so
// the page only makes one request per sync cycle.
export function PennyLeaderboard({ rows }: { rows: Row[] | null }) {
  if (rows == null) return null;

  return (
    <section
      className="panel"
      style={{
        marginTop: "var(--sp-5)",
        padding: "var(--sp-3) var(--sp-4)",
      }}
    >
      <div className="panel-title" style={{ margin: 0, marginBottom: "var(--sp-2)" }}>
        Top Penny Pinchers
      </div>
      <p className="text-mute" style={{ fontSize: 11, margin: "0 0 var(--sp-2) 0" }}>
        Sorted by lifetime PC earned. Refreshes with the game state.
      </p>
      <style>{`
        @keyframes pp-rollup-tag-shine {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
      {rows.length === 0 ? (
        <p className="text-mute">No one&apos;s earned anything yet — be the first.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 28 }}>#</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Player</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Lifetime PC</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Wallet ¢</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Clicks</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Prestiges</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Frugality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.userId}
                  style={{
                    borderBottom: "2px dashed var(--saddle-300)",
                    background: r.isMe ? "var(--surface-highlight)" : undefined,
                  }}
                >
                  <td style={{ padding: "4px 6px", color: rankColor(i + 1) }}>{i + 1}</td>
                  <td style={{ padding: "4px 6px" }}>
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <div
                        className="avatar avatar-sm"
                        style={{
                          background: r.avatarColor,
                          fontSize: 10,
                          width: 22,
                          height: 22,
                          borderWidth: 2,
                        }}
                      >
                        {r.initials}
                      </div>
                      <span>{r.username}</span>
                      {r.isMe && <span className="tag-new">YOU</span>}
                      {r.prestigeCount > 0 && (() => {
                        const pal = prestigeTagPalette(r.prestigeCount);
                        return (
                          <span
                            title={`${r.prestigeCount} Prestige${r.prestigeCount === 1 ? "" : "s"}`}
                            aria-label={`${r.prestigeCount} Prestige${r.prestigeCount === 1 ? "" : "s"}`}
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 9,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: pal.fg,
                              background: pal.bg,
                              backgroundSize: "200% 100%",
                              border: `2px solid ${pal.border}`,
                              padding: "1px 5px",
                              boxShadow: `0 0 8px ${pal.glow}`,
                              animation: "pp-rollup-tag-shine 3s linear infinite",
                            }}
                          >
                            ★ Prestige {r.prestigeCount}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.lifetimePCEarned.toLocaleString()}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: "var(--gold-500)" }}>
                    {r.walletBalance.toLocaleString()}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.lifetimeClicks.toLocaleString()}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>×{r.prestigeCount}</td>
                  <td
                    style={{
                      padding: "4px 6px",
                      textAlign: "right",
                      color: r.frugality > 0 ? "var(--cactus-500)" : r.frugality < 0 ? "var(--crimson-500)" : "var(--saddle-400)",
                    }}
                  >
                    {r.frugality > 0 ? `+${r.frugality}` : r.frugality}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function rankColor(rank: number): string {
  if (rank === 1) return "var(--gold-500)";
  if (rank === 2) return "var(--saddle-300)";
  if (rank === 3) return "var(--crimson-500)";
  return "var(--saddle-400)";
}
