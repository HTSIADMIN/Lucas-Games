// Tiny client-side preferences store. Each key is read/written to
// localStorage; mutations dispatch a window event so any component
// reading the value via the matching hook re-renders.

const TOAST_MUTE_KEY = "lg.bigBetToast.muted";
const CATCH_ME_HIDDEN_KEY = "lg.catchMeChip:hidden";
const CATCH_ME_TOAST_HIDDEN_KEY = "lg.catchMeChip:toastHidden";
const PREF_EVENT = "lg-pref-changed";

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v == null) return fallback;
  return v === "1" || v === "true";
}

function writeBool(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: { key } }));
}

export function getBigBetToastMuted(): boolean {
  return readBool(TOAST_MUTE_KEY, false);
}

export function setBigBetToastMuted(muted: boolean): void {
  writeBool(TOAST_MUTE_KEY, muted);
}

/** React hook (callable from "use client" components) that returns
 *  the current toast-mute flag and re-renders when it changes from
 *  any tab. Lives here as a generic factory so other prefs can
 *  follow the same pattern without rewiring the dispatch. */
import { useEffect, useState } from "react";

export function useBigBetToastMuted(): [boolean, (v: boolean) => void] {
  const [muted, setMuted] = useState<boolean>(() => getBigBetToastMuted());
  useEffect(() => {
    function onChange(e: Event) {
      const ce = e as CustomEvent<{ key?: string }>;
      if (!ce.detail || ce.detail.key === TOAST_MUTE_KEY) {
        setMuted(getBigBetToastMuted());
      }
    }
    function onStorage(e: StorageEvent) {
      if (e.key === TOAST_MUTE_KEY) setMuted(getBigBetToastMuted());
    }
    window.addEventListener(PREF_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PREF_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  function set(v: boolean) {
    setBigBetToastMuted(v);
    setMuted(v);
  }
  return [muted, set];
}

// -------------------------------------------------------------
// Catch-me chip preferences (driven by CompetitiveChip)
// -------------------------------------------------------------

export function getCatchMeChipHidden(): boolean {
  return readBool(CATCH_ME_HIDDEN_KEY, false);
}
export function setCatchMeChipHidden(v: boolean): void {
  writeBool(CATCH_ME_HIDDEN_KEY, v);
}
export function getCatchMeToastSuppressed(): boolean {
  return readBool(CATCH_ME_TOAST_HIDDEN_KEY, false);
}
export function setCatchMeToastSuppressed(v: boolean): void {
  writeBool(CATCH_ME_TOAST_HIDDEN_KEY, v);
}

function useBoolPref(
  key: string,
  read: () => boolean,
  write: (v: boolean) => void,
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => read());
  useEffect(() => {
    function onChange(e: Event) {
      const ce = e as CustomEvent<{ key?: string }>;
      if (!ce.detail || ce.detail.key === key) setValue(read());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === key) setValue(read());
    }
    window.addEventListener(PREF_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PREF_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, read]);
  function set(v: boolean) {
    write(v);
    setValue(v);
  }
  return [value, set];
}

export function useCatchMeChipHidden(): [boolean, (v: boolean) => void] {
  return useBoolPref(CATCH_ME_HIDDEN_KEY, getCatchMeChipHidden, setCatchMeChipHidden);
}
export function useCatchMeToastSuppressed(): [boolean, (v: boolean) => void] {
  return useBoolPref(
    CATCH_ME_TOAST_HIDDEN_KEY,
    getCatchMeToastSuppressed,
    setCatchMeToastSuppressed,
  );
}
