"use client";

import { useEffect } from "react";
import { dispatchAchievementsFromResponse } from "@/lib/achievements/events";

// Global fetch interceptor — sniffs every fetch response for a
// `newlyUnlockedAchievements` array and re-dispatches it as a
// window event so <AchievementToast /> can pop. Mounted once at
// the AppLive root.
//
// Why a global interceptor instead of per-client dispatch? The
// alternative is editing every game client (~10 files) to call
// `dispatchAchievementsFromResponse(data)` after each fetch.
// A single interceptor catches all of them — including any future
// game routes that ship achievements — with zero per-callsite
// overhead. The performance cost is one body-clone + JSON-parse
// per response, and it short-circuits on non-JSON / non-OK reads.
//
// Safety:
//   · Uses response.clone() to read the body without consuming the
//     stream — callers still read the original.
//   · Errors during sniff are swallowed; the original response
//     always reaches the caller intact.
//   · Restores window.fetch on unmount so dev/HMR doesn't stack
//     interceptors.

export function AchievementFetchHook() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const original = window.fetch.bind(window);
    window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>) {
      const response = await original(...args);
      // Only sniff successful JSON responses. Cheap header check
      // avoids parsing PNGs, opaque cross-origin reads, etc.
      try {
        const ct = response.headers.get("content-type") ?? "";
        if (response.ok && ct.includes("json")) {
          response
            .clone()
            .json()
            .then((data) => dispatchAchievementsFromResponse(data))
            .catch(() => { /* malformed body — ignore */ });
        }
      } catch {
        /* never throw from the interceptor */
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return null;
}
