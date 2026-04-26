"use client";

import { useEffect, useState } from "react";

type ProfileData = {
  user: {
    id: string;
    username: string;
    avatarColor: string;
    initials: string;
    memberSince: string | null;
    equipped: {
      avatarColor: string;
      frame: string | null;
      cardDeck: string;
      theme: string;
    };
  };
  stats: {
    balance: number;
    totalBet: number;
    totalWon: number;
    net: number;
    biggestWin: number;
    gamesPlayed: { game: string; count: number; net: number }[];
  };
};

const GAME_LABEL: Record<string, string> = {
  blackjack: "Blackjack",
  slots: "Slots",
  poker: "Poker",
  plinko: "Plinko",
  coinflip: "Coin Flip",
  mines: "Mines",
  dice: "Dice",
  crash: "Crash",
  roulette: "Roulette",
  daily_spin: "Daily Spin",
  crossy_road: "Crossy Road",
};

export function ProfileModal({
  userId,
  onClose,
}: {
  userId: string; // "me" or a uuid
  onClose: () => void;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/profile/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Couldn't load profile."));
  }, [userId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.7)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel panel-wood"
        style={{
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          padding: "var(--sp-6)",
          background: "var(--parchment-100)",
          color: "var(--ink-900)",
          backgroundImage: "none",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          style={{
            float: "right",
            background: "var(--saddle-200)",
            color: "var(--parchment-50)",
            border: "3px solid var(--ink-900)",
            width: 32,
            height: 32,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            cursor: "pointer",
            boxShadow: "var(--bevel-light), var(--bevel-dark)",
          }}
        >
          ×
        </button>

        {!data && !error && <p className="text-mute">Loading...</p>}
        {error && <p style={{ color: "var(--crimson-500)" }}>Couldn't load profile.</p>}
        {data && (
          <>
            <div className="row" style={{ marginBottom: "var(--sp-5)" }}>
              <div
                className="avatar avatar-lg"
                style={{ background: data.user.avatarColor, fontSize: "var(--fs-h2)" }}
              >
                {data.user.initials}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "var(--fs-h2)" }}>{data.user.username}</h2>
                <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
                  Member since {data.user.memberSince ? formatDate(data.user.memberSince) : "—"}
                </p>
              </div>
            </div>

            <div className="grid grid-2" style={{ marginBottom: "var(--sp-5)", gap: "var(--sp-3)" }}>
              <Stat label="Balance" value={`${data.stats.balance.toLocaleString()} ¢`} tone="money" />
              <Stat
                label="Net P/L"
                value={`${data.stats.net >= 0 ? "+" : ""}${data.stats.net.toLocaleString()} ¢`}
                tone={data.stats.net >= 0 ? "win" : "loss"}
              />
              <Stat label="Total Wagered" value={`${data.stats.totalBet.toLocaleString()} ¢`} />
              <Stat label="Total Won" value={`${data.stats.totalWon.toLocaleString()} ¢`} />
              <Stat
                label="Biggest Win"
                value={data.stats.biggestWin > 0 ? `${data.stats.biggestWin.toLocaleString()} ¢` : "—"}
                tone="money"
              />
              <Stat
                label="Hands Played"
                value={data.stats.gamesPlayed.reduce((s, g) => s + g.count, 0).toLocaleString()}
              />
            </div>

            {data.stats.gamesPlayed.length > 0 && (
              <>
                <div className="divider" style={{ marginBottom: "var(--sp-3)" }}>
                  By Game
                </div>
                <table style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Game</th>
                      <th style={{ textAlign: "right", padding: "6px 4px" }}>Played</th>
                      <th style={{ textAlign: "right", padding: "6px 4px" }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stats.gamesPlayed.map((g) => (
                      <tr key={g.game} style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                        <td style={{ padding: "6px 4px" }}>{GAME_LABEL[g.game] ?? g.game}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right" }}>{g.count}</td>
                        <td
                          style={{
                            padding: "6px 4px",
                            textAlign: "right",
                            color: g.net >= 0 ? "var(--cactus-500)" : "var(--crimson-500)",
                          }}
                        >
                          {g.net >= 0 ? "+" : ""}
                          {g.net.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "money" | "win" | "loss" }) {
  const color =
    tone === "money" ? "var(--gold-500)" :
    tone === "win"   ? "var(--cactus-500)" :
    tone === "loss"  ? "var(--crimson-500)" :
    "var(--ink-900)";
  return (
    <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-h4)",
          color,
          textShadow: tone === "money" ? "2px 2px 0 var(--gold-100)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
