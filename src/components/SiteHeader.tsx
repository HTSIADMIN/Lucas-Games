import Link from "next/link";

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <img src="/logo-mark.svg" alt="" className="brand-mark" />
        <div>
          <div className="brand-name">Lucas Games</div>
          <div className="brand-tag">Pixel Saloon</div>
        </div>
      </Link>
      <nav className="site-nav">
        <Link href="/lobby" aria-current={current === "lobby" ? "page" : undefined}>
          Lobby
        </Link>
        <Link href="/leaderboard" aria-current={current === "leaderboard" ? "page" : undefined}>
          Leaderboard
        </Link>
        <Link href="/shop" aria-current={current === "shop" ? "page" : undefined}>
          Shop
        </Link>
      </nav>
    </header>
  );
}
