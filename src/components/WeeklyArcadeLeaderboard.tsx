"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";

// Per-game weekly standings panel rendered inside the Flappy and
// Crossy Road earn pages. Reads /api/games/<game>/weekly which also
// lazy-settles the prior week — so opening the panel can be the
// trigger that pays out last week's #1 if no one had checked yet.

type LBRow = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  bestScore: number;
};

type LastWeek = {
  weekStart: string;
  topUserId: string | null;
  topUsername: string | null;
  topScore: number;
  reward: number;
} | null;

type ArcadeGame = "flappy" | "crossy_road" | "snake";

const SCORE_LABEL: Record<ArcadeGame, string> = {
  flappy: "pipes",
  crossy_road: "rows",
  snake: "fruit",
};

const WEEKLY_PATH: Record<ArcadeGame, string> = {
  flappy: "/api/games/flappy/weekly",
  crossy_road: "/api/games/crossy/weekly",
  snake: "/api/games/snake/weekly",
};

export function WeeklyArcadeLeaderboard({ game }: { game: ArcadeGame }) {
  const [rows, setRows] = useState<LBRow[] | null>(null);
  const [lastWeek, setLastWeek] = useState<LastWeek>(null);
  const [weekEnd, setWeekEnd] = useState<string | null>(null);
  const [reward, setReward] = useState<number>(0);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const path = WEEKLY_PATH[game];
        const r = await fetch(path);
        if (!r.ok) return;
        const d = await r.json() as {
          rows: LBRow[];
          lastWeek: LastWeek;
          weekEnd: string | null;
          reward: number;
        };
        if (cancelled) return;
        setRows(d.rows ?? []);
        setLastWeek(d.lastWeek);
        setWeekEnd(d.weekEnd);
        setReward(d.reward);
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [game]);

  // Tick once per second so the countdown re-renders.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel" style={{ padding: "var(--sp-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="panel-title" style={{ margin: 0 }}>Weekly Standings</div>
        <span className="text-mute" style={{ fontSize: 11 }}>
          Resets {weekEnd ? formatCountdown(weekEnd) : "soon"}
        </span>
      </div>
      <p className="text-mute" style={{ fontSize: 12, margin: "4px 0 var(--sp-3)" }}>
        Top score this week wins <span className="text-money">{reward.toLocaleString()} ¢</span>.
      </p>

      {rows == null ? (
        <p className="text-mute">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-mute">No runs yet this week. Set the bar.</p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {rows.map((r, i) => {
            const rank = i + 1;
            return (
              <div
                key={r.userId}
                className="between"
                style={{
                  padding: "6px 8px",
                  background: rank === 1 ? "var(--gold-100)" : rank <= 3 ? "var(--parchment-200)" : "var(--parchment-100)",
                  borderBottom: "2px dashed var(--saddle-300)",
                  fontFamily: "var(--font-display)",
                }}
              >
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span style={{ width: 20, textAlign: "center", fontSize: 13 }}>
                    {rank === 1 ? "★" : rank}
                  </span>
                  <Avatar
                    initials={r.initials}
                    color={r.avatarColor}
                    size={26}
                    fontSize={11}
                    frame={null}
                    hat={null}
                  />
                  <span style={{ fontSize: 13 }}>{r.username}</span>
                </div>
                <span className="text-money" style={{ fontSize: 13 }}>
                  {r.bestScore.toLocaleString()} {SCORE_LABEL[game]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {lastWeek && lastWeek.topUsername && (
        <div
          style={{
            marginTop: "var(--sp-3)",
            padding: "var(--sp-2)",
            background: "var(--gold-100)",
            border: "2px solid var(--gold-300)",
            fontFamily: "var(--font-display)",
            fontSize: 11,
          }}
        >
          Last week: <b>{lastWeek.topUsername}</b> took the crown with{" "}
          <b>{lastWeek.topScore.toLocaleString()} {SCORE_LABEL[game]}</b>
          {lastWeek.reward > 0 && <> · paid {lastWeek.reward.toLocaleString()} ¢</>}.
        </div>
      )}
    </div>
  );
}

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `in ${d}d ${h % 24}h`;
  }
  return `in ${h}h ${m}m`;
}
