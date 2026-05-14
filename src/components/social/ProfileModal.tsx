"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useBigBetToastMuted } from "@/lib/preferences";
import { formatAmount } from "@/lib/format";
import * as Sfx from "@/lib/sfx";

type ProfileData = {
  user: {
    id: string;
    username: string;
    avatarColor: string;
    initials: string;
    memberSince: string | null;
    isChampion?: boolean;
    equipped: {
      avatarColor: string;
      frame: string | null;
      cardDeck: string;
      theme: string;
      hat?: string | null;
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
  xp?: {
    xp: number;
    level: number;
    intoLevelXp: number;
    toNextXp: number;
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
              <Avatar
                initials={data.user.initials}
                color={data.user.avatarColor}
                size={96}
                fontSize={32}
                level={data.xp?.level}
                frame={data.user.equipped.frame}
                hat={data.user.equipped.hat ?? null}
                champion={!!data.user.isChampion}
              />
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: "var(--fs-h2)" }}>{data.user.username}</h2>
                <p className="text-mute" style={{ fontSize: "var(--fs-small)", marginBottom: 6 }}>
                  Member since {data.user.memberSince ? formatDate(data.user.memberSince) : "—"}
                </p>
                {data.xp && (
                  <div>
                    <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)", color: "var(--gold-500)", textShadow: "2px 2px 0 var(--gold-100)" }}>
                        LVL {data.xp.level}
                      </span>
                      <span className="text-mute" style={{ fontSize: 12 }}>
                        {data.xp.intoLevelXp.toLocaleString()} / {data.xp.toNextXp.toLocaleString()} XP
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        height: 8,
                        background: "var(--parchment-50)",
                        border: "2px solid var(--ink-900)",
                        position: "relative",
                        overflow: "hidden",
                        maxWidth: 240,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (data.xp.intoLevelXp / Math.max(1, data.xp.toNextXp)) * 100)}%`,
                          height: "100%",
                          background: "var(--gold-300)",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-2" style={{ marginBottom: "var(--sp-5)", gap: "var(--sp-3)" }}>
              <Stat label="Balance" value={`${formatAmount(data.stats.balance)} ¢`} tone="money" />
              <Stat
                label="Net P/L"
                value={`${data.stats.net >= 0 ? "+" : ""}${formatAmount(data.stats.net)} ¢`}
                tone={data.stats.net >= 0 ? "win" : "loss"}
              />
              <Stat label="Total Wagered" value={`${formatAmount(data.stats.totalBet)} ¢`} />
              <Stat label="Total Won" value={`${formatAmount(data.stats.totalWon)} ¢`} />
              <Stat
                label="Biggest Win"
                value={data.stats.biggestWin > 0 ? `${formatAmount(data.stats.biggestWin)} ¢` : "—"}
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
                          {formatAmount(g.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {userId === "me" && (
              <Link
                href="/shop#loadout"
                onClick={onClose}
                className="btn btn-wood btn-block"
                style={{
                  marginTop: "var(--sp-4)",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                ✦ My Loadout →
              </Link>
            )}
            {userId === "me" && <SettingsPanel />}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Settings panel — only rendered on the player's own profile.
// Holds client-side preferences that don't need a DB column.
// ============================================================
function SettingsPanel() {
  const [bigBetMuted, setBigBetMuted] = useBigBetToastMuted();
  // Subscribe to the SFX bus so this panel re-renders whenever
  // mute / volume change (including from other tabs that share
  // the same localStorage state).
  const sfxMuted = useSyncExternalStore(Sfx.subscribe, () => Sfx.isMuted(), () => false);
  const sfxVolume = useSyncExternalStore(Sfx.subscribe, () => Sfx.getVolume(), () => 0.7);
  return (
    <div
      className="panel"
      style={{
        background: "var(--parchment-200)",
        padding: "var(--sp-3)",
        marginTop: "var(--sp-5)",
      }}
    >
      <div className="label" style={{ marginBottom: "var(--sp-2)" }}>Settings</div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          fontFamily: "var(--font-display)",
          fontSize: 13,
          padding: "6px 0",
          cursor: "pointer",
        }}
      >
        <span>
          <span style={{ display: "block" }}>Mute big-bet popups</span>
          <span className="text-mute" style={{ fontSize: 11, fontFamily: "var(--font-body)" }}>
            Hide the bottom-left win/loss toasts when other players land big swings.
          </span>
        </span>
        <input
          type="checkbox"
          checked={bigBetMuted}
          onChange={(e) => setBigBetMuted(e.target.checked)}
          style={{ width: 22, height: 22, cursor: "pointer" }}
        />
      </label>

      <hr style={{ border: 0, borderTop: "2px dashed var(--saddle-300)", margin: "var(--sp-2) 0" }} />

      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          fontFamily: "var(--font-display)",
          fontSize: 13,
          padding: "6px 0",
          cursor: "pointer",
        }}
      >
        <span>
          <span style={{ display: "block" }}>Mute sound effects</span>
          <span className="text-mute" style={{ fontSize: 11, fontFamily: "var(--font-body)" }}>
            Silence every game SFX (clicks, wins, dealer flips, etc.). Survives across pages.
          </span>
        </span>
        <input
          type="checkbox"
          checked={sfxMuted}
          onChange={(e) => Sfx.setMuted(e.target.checked)}
          style={{ width: 22, height: 22, cursor: "pointer" }}
        />
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          fontFamily: "var(--font-display)",
          fontSize: 13,
          padding: "6px 0",
          opacity: sfxMuted ? 0.5 : 1,
        }}
      >
        <span>
          <span style={{ display: "block" }}>SFX volume</span>
          <span className="text-mute" style={{ fontSize: 11, fontFamily: "var(--font-body)" }}>
            Master volume across the whole site.
          </span>
        </span>
        <span className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sfxVolume * 100)}
            onChange={(e) => Sfx.setVolume(Number(e.target.value) / 100)}
            disabled={sfxMuted}
            aria-label="SFX volume"
            style={{ width: 120 }}
          />
          <span style={{ minWidth: 32, textAlign: "right", fontFamily: "var(--font-display)", fontSize: 11 }}>
            {Math.round(sfxVolume * 100)}%
          </span>
        </span>
      </label>
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
