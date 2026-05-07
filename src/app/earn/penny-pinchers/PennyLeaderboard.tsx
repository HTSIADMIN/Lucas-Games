"use client";

import { useCallback, useState } from "react";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";

type Row = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  lifetimePCEarned: number;
  lifetimeClicks: number;
  frugality: number;
  prestigeCount: number;
  walletBalance: number;
  isMe: boolean;
};

export function PennyLeaderboard() {
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/earn/penny-pinchers/leaderboard");
      if (!r.ok) return;
      const d = (await r.json()) as { rows?: Row[] };
      setRows(d.rows ?? []);
    } catch { /* ignore */ }
  }, []);
  useVisibleInterval(load, 30_000);

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
        Sorted by lifetime PC earned. Refreshes every 30s.
      </p>
      {rows.length === 0 ? (
        <p className="text-mute">No one's earned anything yet — be the first.</p>
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
                    background: r.isMe ? "var(--gold-100)" : undefined,
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
