"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

// Reusable backdrop + centered card for modals. Matches the pattern
// hand-rolled across ProfileModal, FreeGamesButton, ShopClient
// (pack opener + loadout), ChatDrawer drawer, and a few games.
//
// Behaviour:
//   - Click outside to close (unless dismissable={false}).
//   - Esc to close.
//   - Locks body scroll while open.
//   - Renders children inside a panel-wood card with sane defaults
//     (override via `panelStyle`).

export function ModalShell({
  open,
  onClose,
  children,
  panelStyle,
  width = 520,
  dismissable = true,
  zIndex = 200,
  blur = 3,
  panelClassName = "panel panel-wood",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  panelStyle?: CSSProperties;
  /** Max width in px or any CSS length. Default 520. */
  width?: number | string;
  /** When false, suppresses backdrop-click + Escape close. */
  dismissable?: boolean;
  zIndex?: number;
  /** Backdrop blur in px (0 disables). */
  blur?: number;
  /** Override the inner card's class. Default `panel panel-wood`. */
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={dismissable ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.7)",
        backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
        zIndex,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={panelClassName}
        style={{
          width: `min(${typeof width === "number" ? `${width}px` : width}, 100%)`,
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          background: "var(--parchment-100)",
          color: "var(--ink-900)",
          backgroundImage: "none",
          position: "relative",
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Small helper for the close × button most modals render in their
// title row. Unstyled by default beyond a saddle chip; wrap with a
// `between` row alongside the title.
export function ModalCloseButton({ onClose, label = "close" }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
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
  );
}
