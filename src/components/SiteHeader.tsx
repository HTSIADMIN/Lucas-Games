import Link from "next/link";
import type { ReactNode } from "react";
import { ProfileButton } from "@/components/social/ProfileButton";
import { SfxControls } from "@/components/SfxControls";

export function SiteHeader({
  current,
  centerSlot,
  rightSlot,
}: {
  current?: string;
  centerSlot?: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <img src="/logo-mark.svg" alt="" className="brand-mark" />
        <div>
          <div className="brand-name">Lucas Games</div>
          <div className="brand-tag">Pixel Saloon</div>
        </div>
      </Link>
      <div className="site-header-center">{centerSlot}</div>
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
      {rightSlot}
    </header>
  );
}
