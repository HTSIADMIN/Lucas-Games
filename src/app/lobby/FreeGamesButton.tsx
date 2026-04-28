"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GameIcon, type GameIconName } from "@/components/GameIcon";

type FreeGame = {
  slug: string;
  name: string;
  tag: string;
  icon: GameIconName;
  hasTimer: boolean; // daily-spin + monopoly only
};

const FREE_GAMES: FreeGame[] = [
  { slug: "daily-spin",  name: "Daily Spin",        tag: "ONCE / DAY", icon: "lobby.daily_spin",  hasTimer: true  },
  { slug: "monopoly",    name: "Frontier Monopoly", tag: "EVERY HOUR", icon: "lobby.monopoly",    hasTimer: true  },
  { slug: "crossy-road", name: "Crossy Road",       tag: "FREE",       icon: "lobby.crossy_road", hasTimer: false },
  { slug: "flappy",      name: "Flappy",            tag: "FREE",       icon: "lobby.flappy",      hasTimer: false },
];

type EarnStatus = {
  serverNow: number;
  dailySpin: { ready: boolean; nextAt: number | null; bonusTokens: number };
  monopoly:  { ready: boolean; nextAt: number | null };
};

export function FreeGamesButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<EarnStatus | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Poll status every 30s; refresh immediately when modal opens.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/earn/status", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as EarnStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // ignore
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Re-render once a second so the countdown updates while the modal is open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const anyReady = !!status && (status.dailySpin.ready || status.monopoly.ready);

  return (
    <>
      <button
        type="button"
        className={`btn lobby-action-btn free-games-btn${anyReady ? " is-ready" : ""}${compact ? " btn-sm" : ""}`}
        onClick={() => setOpen(true)}
      >
        Free Games
        {anyReady && <span aria-hidden className="free-games-dot" />}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26, 15, 8, 0.7)",
            backdropFilter: "blur(3px)",
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
              width: "min(520px, 100%)",
              padding: "var(--sp-5)",
              background: "var(--parchment-100)",
              color: "var(--ink-900)",
              backgroundImage: "none",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "var(--sp-4)",
              }}
            >
              <div
                className="uppercase"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-h3)",
                  color: "var(--gold-700)",
                }}
              >
                Free Games
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="close"
                style={{
                  background: "var(--saddle-200)",
                  color: "var(--parchment-50)",
                  border: "3px solid var(--ink-900)",
                  width: 32,
                  height: 32,
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--sp-3)",
              }}
            >
              {FREE_GAMES.map((g) => {
                const tileStatus = tileStatusFor(g.slug, status, tick);
                return (
                  <Link
                    key={g.slug}
                    href={`/earn/${g.slug}`}
                    className={`tile free-games-tile${tileStatus?.ready ? " is-ready" : ""}`}
                    onClick={() => setOpen(false)}
                    style={{
                      background: "var(--gold-100)",
                      padding: "var(--sp-3)",
                      gap: "var(--sp-2)",
                      position: "relative",
                    }}
                  >
                    <div className="tile-art" style={{ background: "var(--gold-200)" }}>
                      <GameIcon name={g.icon} size={96} />
                    </div>
                    <div className="tile-name" style={{ fontSize: "var(--fs-body-lg)" }}>
                      {g.name}
                    </div>
                    <div className="tile-meta">
                      <span className={`badge ${tileStatus?.ready ? "badge-cactus" : "badge-gold"}`}>
                        {tileStatus?.ready ? "READY" : tileStatus?.label ?? g.tag}
                      </span>
                      <span>Play →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Map an EarnStatus into a per-tile {ready, label} blob. Crossy/Flappy
// don't have a timer — we just leave them as their static FREE tag.
function tileStatusFor(
  slug: string,
  status: EarnStatus | null,
  _tick: number,
): { ready: boolean; label: string | null } | null {
  if (!status) return null;
  if (slug === "daily-spin") {
    if (status.dailySpin.ready) return { ready: true, label: "READY" };
    if (status.dailySpin.nextAt) return { ready: false, label: countdown(status.dailySpin.nextAt) };
    return null;
  }
  if (slug === "monopoly") {
    if (status.monopoly.ready) return { ready: true, label: "READY" };
    if (status.monopoly.nextAt) return { ready: false, label: countdown(status.monopoly.nextAt) };
    return null;
  }
  return null;
}

function countdown(targetMs: number): string {
  const ms = Math.max(0, targetMs - Date.now());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
