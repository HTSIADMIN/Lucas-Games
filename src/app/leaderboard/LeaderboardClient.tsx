"use client";

import { useState } from "react";
import { ProfileModal } from "@/components/social/ProfileModal";
import { Avatar } from "@/components/Avatar";

export type LeaderRow = {
  id: string;
  username: string;
  avatar_color: string;
  initials: string;
  equipped_frame?: string | null;
  equipped_hat?: string | null;
  balance: number;
  rank: number;
};

export function LeaderboardClient({
  rows,
  currentUserId,
  championId,
}: {
  rows: LeaderRow[];
  currentUserId: string;
  championId?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <>
      {top3.length > 0 && (
        <Podium top3={top3} currentUserId={currentUserId} championId={championId ?? null} onPick={setSelected} />
      )}

      {rest.length > 0 && (
        <div className="leaderboard" style={{ marginTop: "var(--sp-7)" }}>
          {rest.map((r) => (
            <LeaderRowView
              key={r.id}
              row={r}
              isMe={r.id === currentUserId}
              isChampion={r.id === championId}
              onPick={() => setSelected(r.id)}
            />
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ padding: "var(--sp-7)", textAlign: "center" }} className="text-mute">
          No players yet. Be the first.
        </div>
      )}

      {selected && (
        <ProfileModal userId={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function Podium({
  top3,
  currentUserId,
  championId,
  onPick,
}: {
  top3: LeaderRow[];
  currentUserId: string;
  championId: string | null;
  onPick: (id: string) => void;
}) {
  // Render as 2nd / 1st / 3rd so 1st is in the middle and tallest.
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  return (
    <div
      className="podium-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.15fr 1fr",
        gap: "var(--sp-4)",
        alignItems: "end",
      }}
    >
      {order.map((r, idx) => {
        if (!r) return null;
        const isFirst = r.rank === 1;
        const isSecond = r.rank === 2;
        const isThird = r.rank === 3;
        const tone = isFirst
          ? { accent: "var(--gold-300)", shadow: "var(--gold-500)", glow: "var(--glow-gold)" }
          : isSecond
          ? { accent: "var(--saddle-300)", shadow: "var(--saddle-500)", glow: undefined }
          : { accent: "var(--crimson-300)", shadow: "var(--crimson-700)", glow: undefined };
        const pedestalHeight = isFirst ? 200 : isSecond ? 160 : 140;
        const isMe = r.id === currentUserId;

        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              background: "transparent",
              border: 0,
              padding: 0,
              fontFamily: "var(--font-display)",
            }}
          >
            {/* Player card */}
            <div
              style={{
                background: "var(--parchment-100)",
                border: "4px solid var(--ink-900)",
                padding: "var(--sp-4)",
                boxShadow: tone.glow ?? "var(--sh-card-rest)",
                marginBottom: "var(--sp-2)",
                width: "100%",
                position: "relative",
                transition: "transform var(--dur-quick)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-3px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--sp-3)" }}>
                <Avatar
                  initials={r.initials}
                  color={r.avatar_color}
                  size={isFirst ? 96 : 72}
                  fontSize={isFirst ? 36 : 28}
                  frame={r.equipped_frame ?? null}
                  hat={r.equipped_hat ?? null}
                  champion={r.id === championId || isFirst}
                  style={{ boxShadow: tone.glow }}
                />
              </div>
              <div
                style={{
                  fontSize: isFirst ? "var(--fs-h3)" : "var(--fs-h4)",
                  letterSpacing: "var(--ls-loose)",
                  color: "var(--ink-900)",
                  textAlign: "center",
                  textShadow: "1px 1px 0 var(--parchment-50)",
                  marginBottom: 6,
                }}
              >
                {r.username}
                {isMe && <span className="tag-new" style={{ marginLeft: 6 }}>YOU</span>}
              </div>
              <div
                style={{
                  fontSize: isFirst ? "var(--fs-h2)" : "var(--fs-h3)",
                  color: tone.shadow,
                  textShadow: `2px 2px 0 ${tone.accent}`,
                  textAlign: "center",
                  letterSpacing: "var(--ls-tight)",
                }}
              >
                {r.balance.toLocaleString()} ¢
              </div>
              <div
                style={{
                  fontSize: "var(--fs-tiny)",
                  color: "var(--saddle-400)",
                  textAlign: "center",
                  marginTop: 4,
                  textTransform: "uppercase",
                  letterSpacing: "var(--ls-loose)",
                }}
              >
                {tierLabel(r.rank)}
              </div>
            </div>

            {/* Pedestal */}
            <div
              style={{
                width: "100%",
                height: pedestalHeight,
                background: tone.accent,
                border: "4px solid var(--ink-900)",
                borderBottom: 0,
                position: "relative",
                boxShadow: "inset 0 4px 0 0 rgba(255, 255, 255, 0.3), inset 0 -4px 0 0 rgba(0, 0, 0, 0.2)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: "var(--sp-3)",
              }}
            >
              <span
                style={{
                  fontSize: isFirst ? 88 : 64,
                  color: "var(--ink-900)",
                  textShadow: `2px 2px 0 ${tone.accent}`,
                  lineHeight: 1,
                }}
              >
                {r.rank}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LeaderRowView({
  row,
  isMe,
  isChampion,
  onPick,
}: {
  row: LeaderRow;
  isMe: boolean;
  isChampion: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`leaderboard-row`}
      style={{
        background: isMe ? "var(--gold-100)" : "var(--parchment-100)",
        border: "0",
        borderBottom: "2px dashed var(--saddle-300)",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background var(--dur-quick)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--parchment-200)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = isMe ? "var(--gold-100)" : "var(--parchment-100)")}
    >
      <div className="rank">{row.rank}</div>
      <div className="player">
        <Avatar
          initials={row.initials}
          color={row.avatar_color}
          size={32}
          fontSize={13}
          frame={row.equipped_frame ?? null}
          hat={row.equipped_hat ?? null}
          champion={isChampion}
        />
        <span>{row.username}</span>
        {isMe && <span className="tag-new">YOU</span>}
      </div>
      <div className="game">{tierLabel(row.rank)}</div>
      <div className="winnings">{row.balance.toLocaleString()} ¢</div>
    </button>
  );
}

function tierLabel(rank: number) {
  if (rank === 1)   return "Sheriff";
  if (rank <= 3)   return "Outlaw";
  if (rank <= 10)  return "Gunslinger";
  if (rank <= 20)  return "Bounty Hunter";
  if (rank <= 35)  return "Drifter";
  if (rank <= 50)  return "Prospector";
  if (rank <= 75)  return "Tenderfoot";
  if (rank <= 100) return "Greenhorn";
  if (rank <= 150) return "Saddle Tramp";
  return "Peasant";
}
