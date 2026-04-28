import Link from "next/link";
import type { ReactNode } from "react";
import { ProfileButton } from "@/components/social/ProfileButton";
import { SfxControls } from "@/components/SfxControls";
import { MobileNavMenu } from "@/components/MobileNavMenu";

export function SiteHeader({
  current,
  centerSlot,
  rightSlot,
  // When true, the desktop nav + sfx are hidden on every viewport
  // and a hamburger menu drops them down instead. Used inside game
  // shells so the in-game header stays minimal: just logo, balance,
  // and the menu button.
  compact = false,
}: {
  current?: string;
  centerSlot?: ReactNode;
  rightSlot?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`site-header${compact ? " site-header-compact" : ""}`}>
      <Link href="/" className="brand">
        <img src="/logo-mark.svg" alt="" className="brand-mark" />
        <div>
          <div className="brand-name">Lucas Games</div>
          <div className="brand-tag">Pixel Saloon</div>
        </div>
      </Link>
      <div className="site-header-center">{centerSlot}</div>
      {rightSlot}
      {/* Desktop-only inline nav + sfx. Hidden under the breakpoint;
          MobileNavMenu picks them up there instead. */}
      <div className="site-header-desktop">
        <SfxControls />
        <nav className="site-nav">
          <Link href="/lobby" aria-current={current === "lobby" ? "page" : undefined}>
            Lobby
          </Link>
          <Link href="/leaderboard" aria-current={current === "leaderboard" ? "page" : undefined}>
            Leaderboard
          </Link>
          <Link href="/clans" aria-current={current === "clans" ? "page" : undefined}>
            Clans
          </Link>
          <Link href="/shop" aria-current={current === "shop" ? "page" : undefined}>
            Shop
          </Link>
          <ProfileButton />
        </nav>
      </div>
      <MobileNavMenu current={current} />
    </header>
  );
}
