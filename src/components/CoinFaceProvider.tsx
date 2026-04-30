"use client";

import { createContext, useContext, type ReactNode } from "react";
import { findItem } from "@/lib/shop/catalog";

// Per-page context that exposes the equipped coin-face PNG pair
// for any in-game <CoinFace> renderer. Set once by GameShell from
// `users.equipped_coin_face`; falls back to the built-in pixel coin
// (the radial-gradient brass disc) when nothing is equipped.

export type CoinFaceArt = {
  /** URL of the heads-side image, or null to use the default pixel coin. */
  heads: string | null;
  /** URL of the tails-side image, or null to use the default pixel coin. */
  tails: string | null;
};

const CTX = createContext<CoinFaceArt>({ heads: null, tails: null });

export function CoinFaceProvider({
  itemId,
  children,
}: {
  itemId: string | null | undefined;
  children: ReactNode;
}) {
  const item = itemId ? findItem(itemId) : undefined;
  const meta = (item?.meta ?? {}) as { front?: string; back?: string };
  const value: CoinFaceArt = {
    heads: meta.front ?? null,
    tails: meta.back ?? null,
  };
  return <CTX.Provider value={value}>{children}</CTX.Provider>;
}

export function useCoinFace(): CoinFaceArt {
  return useContext(CTX);
}
