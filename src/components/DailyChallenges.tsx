"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";
import { formatAmount } from "@/lib/format";

// localStorage key + helper for the "fresh since today's daily reset"
// glow on the launcher fab. We compare YYYY-MM-DD UTC strings — the
// challenge backend rolls at UTC midnight too, so this stays in sync
// without needing the actual reset timestamp from the server.
const FRESH_KEY = "lg-daily-challenges-last-seen";
const todayUtc = () => new Date().toISOString().slice(0, 10);

// Bottom-right floating button + modal for daily challenges.
// Renders next to the chat fab (which sits at right: 16, bottom: 16);
// this one stacks above at bottom: 84 so they read as a column.
//
// Polling: the modal refreshes its state every 4s while open so
// progress updates as the player plays in another tab.

export type ChallengeRow = {
  slot: number;
  challengeId: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  goal: number;
  progress: number;
  coinReward: number;
  challengePoints: number;
  completedAt: string | null;
  claimedAt: string | null;
};

const DIFF_COLOR: Record<ChallengeRow["difficulty"], { bg: string; fg: string }> = {
  easy:   { bg: "var(--cactus-300)",  fg: "var(--parchment-50)" },
  medium: { bg: "var(--sky-300)",     fg: "var(--parchment-50)" },
  hard:   { bg: "var(--crimson-300)", fg: "var(--parchment-50)" },
};

export function DailyChallenges() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ChallengeRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [inClan, setInClan] = useState<boolean | null>(null);
  const [clanName, setClanName] = useState<string | null>(null);
  const [freshDaily, setFreshDaily] = useState(false);

  // Fresh-glow state: read once on mount. If the stored "last seen"
  // date doesn't match today's UTC date, the dailies have rolled
  // since the player last opened the modal — pulse the launcher.
  useEffect(() => {
    try {
      const seen = localStorage.getItem(FRESH_KEY);
      if (seen !== todayUtc()) setFreshDaily(true);
    } catch { /* private mode */ }
  }, []);

  // Once the modal opens, mark today as seen and clear the glow so
  // it doesn't keep pulsing while the player is interacting.
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(FRESH_KEY, todayUtc()); } catch { /* ignore */ }
    setFreshDaily(false);
  }, [open]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const r = await fetch("/api/challenges/state");
      const d = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        challenges?: ChallengeRow[];
        message?: string;
        error?: string;
        inClan?: boolean;
        clanName?: string | null;
      };
      if (!r.ok) {
        setErrMsg(d.message ?? `Couldn't load (${r.status}).`);
        // Always set rows to an empty array so we exit the
        // perpetual-loading state and the modal can render the
        // error.
        setRows([]);
        return;
      }
      setRows(d.challenges ?? []);
      setInClan(d.inClan ?? false);
      setClanName(d.clanName ?? null);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Couldn't load challenges.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + lazy poll while open. We also load lazily on
  // first open (rather than on mount) so the launcher button's
  // claimable badge is correct without paying for it on every page.
  useEffect(() => {
    if (open && !rows) void refresh();
  }, [open, rows, refresh]);
  // While open: tight 4s poll for live progress.
  useVisibleInterval(refresh, open ? 4000 : null);
  // While closed: the launcher badge count comes from the shared
  // AppSnapshot poll — no per-page fetch here.

  const { snapshot, refresh: refreshSnapshot } = useAppSnapshot();
  // Prefer the live `rows` count whenever the modal has loaded them
  // (so the badge updates immediately after a claim); fall back to
  // the shared snapshot's `dailyClaimable` for the default closed
  // state where no rows have been fetched yet.
  const claimable = rows
    ? rows.filter((r) => r.completedAt && !r.claimedAt).length
    : snapshot?.dailyClaimable ?? 0;

  async function claim(slot: number) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/challenges/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      if (!r.ok) return;
      await refresh();
      // Wallet got credited for the claim — pull a fresh snapshot so
      // the header balance reflects it without waiting for the 10s tick.
      refreshSnapshot();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Sits to the LEFT of the chat fab (which is at right:16,
          bottom:16, 56px wide). Stacking them in a column blocked the
          opened chat panel; placing them in a row keeps both fabs
          tappable while the chat drawer is open. */}
      <div style={{ position: "fixed", right: 84, bottom: 16, zIndex: 99 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Daily Challenges"
          aria-expanded={open}
          title="Daily Challenges"
          style={{
            position: "relative",
            height: 56,
            paddingInline: 14,
            background: "var(--cactus-500)",
            border: "4px solid var(--ink-900)",
            color: "var(--parchment-50)",
            boxShadow: claimable > 0
              ? "var(--sh-card-rest), var(--glow-gold)"
              : "var(--sh-card-rest)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-display)",
            fontSize: 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
            whiteSpace: "nowrap",
            // Animation precedence: claimable (most urgent) > fresh
            // (today's dailies haven't been opened yet) > none.
            animation: claimable > 0
              ? "tile-alert-pulse 1.4s ease-in-out infinite"
              : freshDaily
              ? "daily-fresh-pulse 2.2s ease-in-out infinite"
              : undefined,
          }}
        >
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1, marginTop: -1 }}>★</span>
          <span>Daily</span>
          {claimable > 0 && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -8,
                right: -8,
                minWidth: 22,
                height: 22,
                padding: "0 6px",
                background: "var(--crimson-300)",
                color: "var(--parchment-50)",
                border: "2px solid var(--ink-900)",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: 12,
                boxShadow: "0 0 12px rgba(255, 85, 68, 0.85)",
              }}
            >
              {claimable}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,15,8,0.7)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--sp-4)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              width: "min(560px, 100%)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-h3)",
                  color: "var(--gold-300)",
                  letterSpacing: "var(--ls-loose)",
                  textShadow: "2px 2px 0 var(--ink-900)",
                }}
              >
                DAILY CHALLENGES
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-mute" style={{ fontSize: 12, marginBottom: "var(--sp-3)" }}>
              Three a day. Completing a challenge pays coins to you and contributes points to your clan's
              weekly ranking.
            </p>

            {loading && !rows && <p className="text-mute">Loading…</p>}
            {!loading && errMsg && (
              <div
                style={{
                  background: "var(--crimson-500)",
                  color: "var(--parchment-50)",
                  padding: "var(--sp-3)",
                  border: "3px solid var(--ink-900)",
                  marginBottom: "var(--sp-3)",
                  fontFamily: "var(--font-display)",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                }}
              >
                {errMsg}
              </div>
            )}
            {!loading && !errMsg && rows && rows.length === 0 && (
              <p className="text-mute" style={{ textAlign: "center", padding: "var(--sp-4)" }}>
                No challenges yet. Try again in a moment.
              </p>
            )}
            {rows?.map((row) => {
              const pct = Math.min(100, Math.round((row.progress / row.goal) * 100));
              const claimable = !!row.completedAt && !row.claimedAt;
              const claimed = !!row.claimedAt;
              const tone = DIFF_COLOR[row.difficulty];
              return (
                <div
                  key={row.slot}
                  style={{
                    background: "var(--parchment-100)",
                    border: `3px solid ${tone.bg}`,
                    padding: "var(--sp-3)",
                    marginBottom: "var(--sp-2)",
                    opacity: claimed ? 0.6 : 1,
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className="badge"
                        style={{ background: tone.bg, color: tone.fg, fontSize: 10 }}
                      >
                        {row.difficulty.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-body-lg)", color: "var(--ink-900)" }}>
                        {row.title}
                      </span>
                    </div>
                    <span className="text-mute" style={{ fontSize: 11 }}>
                      {row.progress.toLocaleString()} / {row.goal.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-mute" style={{ fontSize: 12, margin: "0 0 6px 0" }}>
                    {row.description}
                  </p>
                  <div
                    style={{
                      height: 8,
                      background: "var(--parchment-200)",
                      border: "2px solid var(--ink-900)",
                      marginBottom: 6,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: claimed
                          ? "var(--saddle-300)"
                          : row.completedAt
                          ? "var(--gold-300)"
                          : tone.bg,
                        transition: "width 400ms var(--ease-out)",
                      }}
                    />
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="text-money" style={{ fontFamily: "var(--font-display)", fontSize: 13 }}>
                      +{formatAmount(row.coinReward)} ¢ · +{row.challengePoints} clan pts
                    </span>
                    {claimed ? (
                      <span className="badge badge-cactus">CLAIMED</span>
                    ) : claimable ? (
                      <button
                        type="button"
                        className="btn btn-sm action-ready"
                        onClick={() => claim(row.slot)}
                        disabled={busy}
                      >
                        Claim
                      </button>
                    ) : (
                      <span className="text-mute" style={{ fontSize: 11 }}>In progress</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Clan CTA — sits at the bottom of the modal because
                challenge points feed your clan's weekly ranking, so
                the action of "and then... look at clan standings" is
                a natural follow-on. Copy adapts to whether the player
                is already in a clan or still needs to find one. */}
            {!loading && !errMsg && rows && rows.length > 0 && inClan != null && (
              <Link
                href="/clans"
                onClick={() => setOpen(false)}
                className="btn btn-wood"
                style={{
                  marginTop: "var(--sp-3)",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  textDecoration: "none",
                  fontFamily: "var(--font-display)",
                  fontSize: 13,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {inClan ? (
                  <>
                    <span aria-hidden>⚐</span>
                    <span>{clanName ? `View ${clanName}` : "View your clan"}</span>
                    <span aria-hidden style={{ opacity: 0.7 }}>→</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden>★</span>
                    <span>Join a clan to bank these points</span>
                    <span aria-hidden style={{ opacity: 0.7 }}>→</span>
                  </>
                )}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
