"use client";

import { useSyncExternalStore } from "react";
import * as Sfx from "@/lib/sfx";

// Mute toggle + volume slider for the master SFX bus. Lives in the
// SiteHeader. Both controls are persisted via localStorage by the
// SFX module.

const subscribe = (fn: () => void) => Sfx.subscribe(fn);

function useSfxState() {
  const muted  = useSyncExternalStore(subscribe, Sfx.isMuted,  () => false);
  const volume = useSyncExternalStore(subscribe, Sfx.getVolume, () => 0.7);
  return { muted, volume };
}

// Custom horn-shaped volume glyph. Tier maps to how many waves we
// draw to the right of the cone (0 = muted with slash, 1 = quiet,
// 2 = mid, 3 = loud) so the icon reflects the slider value.
function VolumeGlyph({ tier }: { tier: 0 | 1 | 2 | 3 }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
      style={{ display: "block" }}
    >
      {/* Speaker cone */}
      <rect x={2} y={6} width={2} height={4} fill="currentColor" />
      <rect x={4} y={5} width={1} height={6} fill="currentColor" />
      <rect x={5} y={4} width={1} height={8} fill="currentColor" />
      <rect x={6} y={3} width={1} height={10} fill="currentColor" />
      <rect x={7} y={2} width={1} height={12} fill="currentColor" />
      {/* Wave 1 (quiet+) */}
      {tier >= 1 && <rect x={9} y={7} width={1} height={2} fill="currentColor" />}
      {/* Wave 2 (mid+) */}
      {tier >= 2 && (
        <>
          <rect x={10} y={6} width={1} height={1} fill="currentColor" />
          <rect x={11} y={7} width={1} height={2} fill="currentColor" />
          <rect x={10} y={9} width={1} height={1} fill="currentColor" />
        </>
      )}
      {/* Wave 3 (loud) */}
      {tier >= 3 && (
        <>
          <rect x={12} y={5} width={1} height={1} fill="currentColor" />
          <rect x={13} y={6} width={1} height={4} fill="currentColor" />
          <rect x={12} y={10} width={1} height={1} fill="currentColor" />
        </>
      )}
      {/* Mute slash */}
      {tier === 0 && (
        <>
          <rect x={9} y={6} width={1} height={1} fill="currentColor" />
          <rect x={10} y={7} width={1} height={1} fill="currentColor" />
          <rect x={11} y={8} width={1} height={1} fill="currentColor" />
          <rect x={12} y={9} width={1} height={1} fill="currentColor" />
          <rect x={12} y={6} width={1} height={1} fill="currentColor" />
          <rect x={11} y={7} width={1} height={1} fill="currentColor" />
          <rect x={10} y={8} width={1} height={1} fill="currentColor" />
          <rect x={9} y={9} width={1} height={1} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function SfxControls() {
  const { muted, volume } = useSfxState();
  const tier: 0 | 1 | 2 | 3 = muted
    ? 0
    : volume < 0.34
    ? 1
    : volume < 0.67
    ? 2
    : 3;
  return (
    <div className="sfx-controls" aria-label="Sound controls">
      <button
        type="button"
        className="sfx-mute"
        onClick={() => {
          const next = !muted;
          Sfx.setMuted(next);
          // Confirmation chime when unmuting (so the user knows audio
          // is back on). No chime when muting — that would defeat
          // the whole point.
          if (!next) Sfx.play("ui.click");
        }}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        title={muted ? "Sound off (click to unmute)" : "Sound on (click to mute)"}
      >
        <VolumeGlyph tier={tier} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (muted && v > 0) Sfx.setMuted(false);
          Sfx.setVolume(v);
        }}
        aria-label="Volume"
        className="sfx-slider"
      />
    </div>
  );
}
