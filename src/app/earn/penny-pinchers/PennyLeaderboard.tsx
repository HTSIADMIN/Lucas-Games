"use client";

import type { LeaderboardRow as Row } from "./PennyPinchersClient";

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
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Roll-Ups</th>
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
                      {r.prestigeCount > 0 && (
                        <span
                          title={`${r.prestigeCount} Roll-Up${r.prestigeCount === 1 ? "" : "s"}`}
                          aria-label={`Roll-Up Club member, ${r.prestigeCount} Roll-Ups`}
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 9,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--ink-900)",
                            background: "linear-gradient(90deg, var(--gold-300), var(--gold-500), var(--gold-300))",
                            backgroundSize: "200% 100%",
                            border: "2px solid var(--ink-900)",
                            padding: "1px 5px",
                            boxShadow: "0 0 8px rgba(255,196,64,0.55)",
                            animation: "pp-rollup-tag-shine 3s linear infinite",
                          }}
                        >
                          ★ Roll-Up Club
                        </span>
                      )}
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
