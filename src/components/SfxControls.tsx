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

export function SfxControls() {
  const { muted, volume } = useSfxState();
  return (
    <div className="sfx-controls" aria-label="Sound controls">
      <button
        type="button"
        className="sfx-mute"
        onClick={() => Sfx.setMuted(!muted)}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        title={muted ? "Sound off (click to unmute)" : "Sound on (click to mute)"}
      >
        {muted ? "🔇" : volume < 0.34 ? "🔈" : volume < 0.67 ? "🔉" : "🔊"}
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
