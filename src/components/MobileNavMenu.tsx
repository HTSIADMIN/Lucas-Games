"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileButton } from "@/components/social/ProfileButton";
import { SfxControls } from "@/components/SfxControls";

// Hamburger drop-down for mobile. The desktop SiteHeader keeps the
// inline nav; this component is hidden via CSS until the viewport
// drops below the breakpoint. Used in two modes:
//   - default: nav links + sfx controls, shown next to the desktop
//     nav on lobby/leaderboard/shop/clans pages
//   - compact: inside a game shell, where we want everything except
//     the logo + balance hidden behind the menu

const NAV_ITEMS = [
  { href: "/lobby",       label: "Lobby",       key: "lobby" },
  { href: "/leaderboard", label: "Leaderboard", key: "leaderboard" },
  { href: "/clans",       label: "Clans",       key: "clans" },
  { href: "/shop",        label: "Shop",        key: "shop" },
] as const;

export function MobileNavMenu({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="mobile-nav">
      <button
        type="button"
        className="mobile-nav-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className="mobile-nav-trigger-bar" />
        <span className="mobile-nav-trigger-bar" />
        <span className="mobile-nav-trigger-bar" />
      </button>
      {open && (
        <>
          <div
            className="mobile-nav-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="mobile-nav-panel" role="menu">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="mobile-nav-link"
                aria-current={current === item.key ? "page" : undefined}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                {item.label}
              </Link>
            ))}
            <div className="mobile-nav-divider" />
            <div className="mobile-nav-row">
              <span className="mobile-nav-label">Sound</span>
              <SfxControls />
            </div>
            <div className="mobile-nav-row">
              <span className="mobile-nav-label">Account</span>
              <ProfileButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
