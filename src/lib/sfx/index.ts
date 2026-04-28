// SFX bus.
//
// • Module-level state so any client component can call play() —
//   no provider needed. localStorage backs mute + master volume so
//   the preference survives navigation.
// • Audio elements are lazy-allocated on first play (browsers refuse
//   to play before a user gesture; the first user click on the page
//   "unlocks" the bus).
// • Per-name throttle + a small voice pool prevents rapid repeats
//   from cutting each other off.
// • subscribe() lets the controls UI re-render when mute / volume
//   change.

import { SFX_REGISTRY, type SfxName, type SfxSpec } from "./registry";

const MUTED_KEY  = "lg.sfx.muted";
const VOLUME_KEY = "lg.sfx.volume";

type Voice = { el: HTMLAudioElement; lastUsed: number };

// Per-name pool of HTMLAudioElement voices.
const POOLS = new Map<SfxName, Voice[]>();
const LAST_PLAYED_AT = new Map<SfxName, number>();

let _muted  = false;
let _volume = 0.7;
let _unlocked = false;

const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const m = window.localStorage.getItem(MUTED_KEY);
    if (m === "1") _muted = true;
    const v = parseFloat(window.localStorage.getItem(VOLUME_KEY) ?? "");
    if (Number.isFinite(v)) _volume = clamp01(v);
  } catch {
    // Private mode / storage disabled — keep defaults.
  }

  // Unlock audio on first user gesture.
  const onFirstGesture = () => {
    _unlocked = true;
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("keydown", onFirstGesture);
  };
  window.addEventListener("pointerdown", onFirstGesture, { once: false, passive: true });
  window.addEventListener("keydown", onFirstGesture, { once: false, passive: true });
}

function notify() {
  for (const fn of listeners) fn();
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function ensurePool(name: SfxName): Voice[] {
  let pool = POOLS.get(name);
  if (pool) return pool;
  const spec: SfxSpec = SFX_REGISTRY[name];
  pool = [];
  for (let i = 0; i < spec.voices; i++) {
    const el = new Audio(spec.src);
    el.preload = "auto";
    pool.push({ el, lastUsed: 0 });
  }
  POOLS.set(name, pool);
  return pool;
}

/** Play a sound by logical name. No-op if muted or pre-gesture. */
export function play(name: SfxName): void {
  if (typeof window === "undefined") return;
  if (_muted) return;
  if (!_unlocked) return;
  const spec = SFX_REGISTRY[name];
  if (!spec) return;

  const now = performance.now();
  const last = LAST_PLAYED_AT.get(name) ?? 0;
  if (now - last < spec.throttleMs) return;
  LAST_PLAYED_AT.set(name, now);

  const pool = ensurePool(name);
  // Pick the LRU voice — least-recently-used.
  let voice = pool[0];
  for (const v of pool) if (v.lastUsed < voice.lastUsed) voice = v;
  voice.lastUsed = now;

  try {
    voice.el.volume = clamp01(spec.volume * _volume);
    voice.el.currentTime = 0;
    void voice.el.play().catch(() => { /* swallow: pre-gesture or interrupted */ });
  } catch {
    // Browser autoplay policy or other Audio quirk — best-effort.
  }
}

/**
 * Start a looped sound. Returns a stop() function. Volume is locked
 * to the registry spec × master at start; updateVolume(v) lets the
 * caller fade with drag velocity etc.
 */
export function loop(name: SfxName): { stop: () => void; setRate: (r: number) => void } {
  if (typeof window === "undefined" || _muted || !_unlocked) {
    return { stop: () => {}, setRate: () => {} };
  }
  const spec = SFX_REGISTRY[name];
  const el = new Audio(spec.src);
  el.preload = "auto";
  el.loop = true;
  el.volume = clamp01(spec.volume * _volume);
  void el.play().catch(() => {});
  return {
    stop: () => { try { el.pause(); el.src = ""; } catch {} },
    setRate: (r) => { try { el.playbackRate = Math.max(0.5, Math.min(2, r)); } catch {} },
  };
}

export function isMuted(): boolean { return _muted; }
export function getVolume(): number { return _volume; }

export function setMuted(b: boolean): void {
  _muted = b;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(MUTED_KEY, b ? "1" : "0"); } catch {}
  }
  // Stop any actively-playing voices when muting so we cut clean.
  if (b) {
    for (const pool of POOLS.values()) {
      for (const v of pool) { try { v.el.pause(); v.el.currentTime = 0; } catch {} }
    }
  }
  notify();
}

export function setVolume(v: number): void {
  _volume = clamp01(v);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(VOLUME_KEY, _volume.toFixed(3)); } catch {}
  }
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
