"use client";

import { useEffect, useState } from "react";

type Row = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  bestScore: number;
  bestPayout: number;
  runs: number;
};

export function MiniLeaderboard({
  endpoint,
  title = "Top Scores",
  scoreLabel = "Score",
  currentUserId,
  pollMs = 10_000,
}: {
  endpoint: string;
  title?: string;
  scoreLabel?: string;
  currentUserId?: string | null;
  pollMs?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(endpoint);
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setRows(d.rows ?? []);
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    }
    load();
    const t = setInterval(load, pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [endpoint, pollMs]);

  return (
    <section className="panel" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-6)" }}>
      <div className="panel-title">{title}</div>
      {loading && rows.length === 0 ? (
        <p className="text-mute">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-mute">No scores yet. Be the first.</p>
      ) : (
        <table style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
              <th style={{ textAlign: "left", padding: "6px 4px", width: 48 }}>#</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Player</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>{scoreLabel}</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Best Payout</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Runs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isMe = r.userId === currentUserId;
              return (
                <tr
                  key={r.userId}
                  style={{
                    borderBottom: "2px dashed var(--saddle-300)",
                    background: isMe ? "var(--gold-100)" : undefined,
                  }}
                >
                  <td style={{ padding: "6px 4px", color: rankColor(i + 1) }}>{i + 1}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <div className="row" style={{ gap: 8 }}>
                      <div
                        className="avatar avatar-sm"
                        style={{
                          background: r.avatarColor,
                          fontSize: 11,
                          width: 24,
                          height: 24,
                          borderWidth: 2,
                        }}
                      >
                        {r.initials}
                      </div>
                      <span>{r.username}</span>
                      {isMe && <span className="tag-new">YOU</span>}
                    </div>
                  </td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{r.bestScore}</td>
                  <td
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                      color: "var(--gold-500)",
                      textShadow: "1px 1px 0 var(--gold-100)",
                    }}
                  >
                    {r.bestPayout.toLocaleString()} ¢
                  </td>
                  <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--saddle-400)" }}>
                    {r.runs}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function rankColor(r: number) {
  if (r === 1) return "var(--gold-500)";
  if (r === 2) return "var(--saddle-300)";
  if (r === 3) return "var(--crimson-500)";
  return "var(--saddle-400)";
}
