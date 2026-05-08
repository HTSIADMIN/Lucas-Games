"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GameIcon } from "@/components/GameIcon";
import { FREE_GAMES } from "@/lib/games/freeGames";
import { ModalShell, ModalCloseButton } from "@/components/ModalShell";
import { useAppSnapshot, type EarnStatus } from "@/components/AppSnapshotProvider";
import * as Sfx from "@/lib/sfx";

export function FreeGamesButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { snapshot, refresh } = useAppSnapshot();
  const status: EarnStatus | null = snapshot?.earn ?? null;
  const [tick, setTick] = useState(0);
  const wasReadyRef = useRef<boolean>(false);

  // Force a snapshot refresh on first open so the modal doesn't
  // stale-render last-known readiness if the player just claimed a
  // spin in another tab.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Re-render once a second so the countdown updates while the modal is open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Allow other UI (the lobby Free Games tile, BrokeModal, etc.) to
  // open this modal without us having to refactor it into a context.
  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener("lg:open-free-games", onOpen);
    return () => window.removeEventListener("lg:open-free-games", onOpen);
  }, []);

  const anyReady = !!status && (status.dailySpin.ready || status.monopoly.ready);

  // Chime once when readiness flips on (cooldown finished while the
  // player was looking at the page).
  useEffect(() => {
    if (anyReady && !wasReadyRef.current) {
      Sfx.play("win.levelup");
    }
    wasReadyRef.current = anyReady;
  }, [anyReady]);

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
      <ModalShell open={open} onClose={() => setOpen(false)} width={520}>
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
          <ModalCloseButton onClose={() => setOpen(false)} />
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
                      background: "var(--surface-highlight)",
                      padding: "var(--sp-3)",
                      gap: "var(--sp-2)",
                      position: "relative",
                    }}
                  >
                    <div className="tile-art">
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
      </ModalShell>
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
