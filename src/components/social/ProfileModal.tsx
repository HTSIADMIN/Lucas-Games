"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useBigBetToastMuted } from "@/lib/preferences";
import { formatAmount } from "@/lib/format";
import { AchievementShowcase } from "@/components/AchievementShowcase";
import * as Sfx from "@/lib/sfx";

type Transaction = {
  id: number;
  delta: number;
  reason: string;
  refKind: string | null;
  refId: string | null;
  createdAt: string;
};

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
    /** What's feeding the XP — surfaced as a tiny hint under the
     *  LVL badge so the player understands the level is activity-
     *  driven, not money-driven. Optional so older payloads still
     *  render (UI just hides the hint). */
    gamesPlayed?: number;
    achievementsUnlocked?: number;
    playMinutes?: number;
  };
  /** Newest-first wallet ledger entries — only populated on the
   *  requester's own profile, empty for everyone else. */
  transactions: Transaction[];
  /** Trophy showcase — total unlocked + most-recent 5. */
  achievements?: {
    total: number;
    recent: { source: string; achievementId: string; unlockedAt: string }[];
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

/** Map a wallet `reason` string to a player-facing label. Falls
 *  through to a title-cased version of the raw reason for any
 *  string not listed here — newer codepaths land sensibly even
 *  before this map is updated. */
const REASON_LABEL: Record<string, string> = {
  signup_bonus: "Welcome bonus",
  // Slots
  slots_bet: "Slots — bet",
  slots_win: "Slots — line win",
  slots_bonus_win: "Slots — bonus win",
  slots_jackpot: "Slots — JACKPOT!",
  // Blackjack
  blackjack_bet: "Blackjack — bet",
  blackjack_win: "Blackjack — win",
  blackjack_payout: "Blackjack — settle",
  blackjack_mp_bet: "Blackjack MP — bet",
  blackjack_mp_win: "Blackjack MP — settle",
  // Roulette
  roulette_bet: "Roulette — bet",
  roulette_win: "Roulette — win",
  roulette_settle: "Roulette — settle",
  roulette_hot_bonus: "Roulette — hot bonus",
  // Mines
  mines_bet: "Mines — bet",
  mines_cashout: "Mines — cashout",
  // Crash
  crash_bet: "Crash — bet",
  crash_cashout: "Crash — cashout",
  // Plinko / dice / coinflip / poker / scratch
  plinko_bet: "Plinko — bet",
  plinko_win: "Plinko — win",
  dice_bet: "Dice — bet",
  dice_win: "Dice — win",
  coinflip_bet: "Coin Flip — bet",
  coinflip_win: "Coin Flip — win",
  coinflip_duel_bet: "Coin Flip duel — bet",
  coinflip_duel_win: "Coin Flip duel — win",
  poker_bet: "Poker — buy-in",
  poker_win: "Poker — payout",
  scratch_bet: "Scratch — ticket",
  scratch_win: "Scratch — payout",
  // Tip
  tip_send: "Tip sent",
  tip_received: "Tip received",
  // Earn games
  daily_spin: "Daily Spin reward",
  penny_pinchers_bank: "Penny Pinchers bank",
  monopoly_roll: "Monopoly roll",
  monopoly_pack: "Monopoly pack",
  monopoly_mystery_pay: "Monopoly mystery — pay",
  monopoly_upgrade: "Monopoly upgrade",
  flappy_score: "Flappy reward",
  snake_score: "Snake reward",
  crossy_road_score: "Crossy Road reward",
  // Shop / cosmetics
  shop_buy: "Shop purchase",
  shop_pack_open: "Shop pack opened",
  shop_pack_buy: "Shop pack",
  // Clans / challenges
  clan_create: "Clan founded",
  clan_chest_open: "Clan chest",
  challenge_reward: "Daily challenge reward",
  arcade_upgrade: "Arcade upgrade",
};

function labelForReason(reason: string): string {
  if (REASON_LABEL[reason]) return REASON_LABEL[reason];
  // Fallback: prefix prefixes are usually `<game>_<action>`. Title-
  // case + replace underscores for a passable display string.
  return reason
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Compact relative-time stamp for the transaction list. */
function formatAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const delta = Date.now() - t;
  if (!Number.isFinite(delta) || delta < 0) return "just now";
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
        padding: "var(--sp-3)",
      }}
    >
      <style>{`
        /* Mobile tightening for the profile modal. The desktop layout
           sits at 96px avatar + sp-6 padding + a row header; on a
           360px phone that leaves almost no room for the username +
           XP bar. These rules trim padding, scale the avatar down,
           and let the header row wrap cleanly. */
        @media (max-width: 540px) {
          .pp-profile-modal {
            padding: var(--sp-3) !important;
          }
          .pp-profile-modal .pp-profile-header {
            flex-wrap: wrap;
            gap: var(--sp-3) !important;
            margin-bottom: var(--sp-4) !important;
          }
          .pp-profile-modal .pp-profile-avatar-slot {
            flex: 0 0 auto;
          }
          .pp-profile-modal .pp-profile-headline {
            font-size: var(--fs-h3) !important;
          }
          .pp-profile-modal .pp-profile-stats {
            gap: var(--sp-2) !important;
          }
          .pp-profile-modal .pp-profile-stats .panel {
            padding: var(--sp-2) !important;
          }
          .pp-profile-modal .pp-profile-stats .label {
            font-size: 10px;
          }
          .pp-profile-modal .pp-profile-stats .pp-stat-value {
            font-size: var(--fs-body-lg) !important;
          }
          /* By-game table — let the numeric columns shrink so the
             game name takes the remainder, and tighten row padding. */
          .pp-profile-modal table.pp-profile-bygame td,
          .pp-profile-modal table.pp-profile-bygame th {
            padding: 4px 2px !important;
            font-size: 12px !important;
          }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel panel-wood pp-profile-modal"
        style={{
          position: "relative",
          width: "min(560px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
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
            position: "absolute",
            top: "var(--sp-2)",
            right: "var(--sp-2)",
            background: "var(--saddle-200)",
            color: "var(--parchment-50)",
            border: "3px solid var(--ink-900)",
            width: 32,
            height: 32,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            cursor: "pointer",
            boxShadow: "var(--bevel-light), var(--bevel-dark)",
            zIndex: 1,
          }}
        >
          ×
        </button>

        {!data && !error && <p className="text-mute">Loading...</p>}
        {error && <p style={{ color: "var(--crimson-500)" }}>Couldn't load profile.</p>}
        {data && (
          <>
            <div
              className="row pp-profile-header"
              style={{ marginBottom: "var(--sp-5)", alignItems: "center" }}
            >
              <div className="pp-profile-avatar-slot">
                <Avatar
                  initials={data.user.initials}
                  color={data.user.avatarColor}
                  size={80}
                  fontSize={28}
                  level={data.xp?.level}
                  frame={data.user.equipped.frame}
                  hat={data.user.equipped.hat ?? null}
                  champion={!!data.user.isChampion}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  className="pp-profile-headline"
                  style={{
                    margin: 0,
                    fontSize: "var(--fs-h2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    paddingRight: 40,
                  }}
                >
                  {data.user.username}
                </h2>
                <p className="text-mute" style={{ fontSize: "var(--fs-small)", marginBottom: 6 }}>
                  Member since {data.user.memberSince ? formatDate(data.user.memberSince) : "—"}
                </p>
                {data.xp && (
                  <div>
                    <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
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
                    {/* Activity breakdown — explains where the level
                        comes from (games played + achievements
                        unlocked). Hidden when neither counter is
                        present (older API responses). */}
                    {(data.xp.gamesPlayed != null || data.xp.achievementsUnlocked != null) && (
                      <div className="text-mute" style={{ fontSize: 11, marginTop: 4, letterSpacing: "0.04em" }}>
                        {data.xp.gamesPlayed != null && (
                          <span>{data.xp.gamesPlayed.toLocaleString()} game{data.xp.gamesPlayed === 1 ? "" : "s"}</span>
                        )}
                        {data.xp.gamesPlayed != null && data.xp.achievementsUnlocked != null && (
                          <span> · </span>
                        )}
                        {data.xp.achievementsUnlocked != null && data.xp.achievementsUnlocked > 0 && (
                          <span>{data.xp.achievementsUnlocked} trophy{data.xp.achievementsUnlocked === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              className="grid grid-2 pp-profile-stats"
              style={{ marginBottom: "var(--sp-5)", gap: "var(--sp-3)" }}
            >
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
                <table
                  className="pp-profile-bygame"
                  style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 14 }}
                >
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
            {data.achievements && (data.achievements.total > 0 || userId === "me") && (
              <>
                <div className="divider" style={{ marginTop: "var(--sp-5)", marginBottom: "var(--sp-3)" }}>
                  Trophies
                </div>
                <AchievementShowcase
                  total={data.achievements.total}
                  recent={data.achievements.recent}
                  showEmpty={userId === "me"}
                />
              </>
            )}
            {data.transactions.length > 0 && (
              <>
                <div className="divider" style={{ marginTop: "var(--sp-5)", marginBottom: "var(--sp-3)" }}>
                  Recent Activity
                </div>
                <WalletHistory rows={data.transactions} />
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
        className="pp-stat-value"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-h4)",
          color,
          textShadow: tone === "money" ? "2px 2px 0 var(--gold-100)" : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
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

/** Scrollable wallet ledger panel — newest first, signed deltas
 *  colored win/loss, reason labels prettified via REASON_LABEL.
 *  Capped at ~280px tall so the modal stays manageable; overflow
 *  scrolls. */
function WalletHistory({ rows }: { rows: Transaction[] }) {
  return (
    <div
      className="panel"
      style={{
        background: "var(--parchment-50)",
        padding: 0,
        maxHeight: 280,
        overflowY: "auto",
      }}
    >
      {rows.map((tx) => {
        const positive = tx.delta >= 0;
        const sign = positive ? "+" : "";
        const color = positive ? "var(--cactus-500)" : "var(--crimson-500)";
        return (
          <div
            key={tx.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "baseline",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px dashed var(--saddle-200)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 13,
                  color: "var(--ink-900)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {labelForReason(tx.reason)}
              </div>
              <div className="text-mute" style={{ fontSize: 11 }}>
                {formatAgo(tx.createdAt)}
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                color,
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
            >
              {sign}
              {formatAmount(tx.delta)} ¢
            </div>
          </div>
        );
      })}
    </div>
  );
}
