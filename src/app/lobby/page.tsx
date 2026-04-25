import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import { getUserById } from "@/lib/db";
import { SignOutButton } from "./SignOutButton";

const GAMES = [
  { slug: "coinflip",  name: "Coin Flip", tag: "QUICK",   live: true  },
  { slug: "dice",      name: "Dice",      tag: "QUICK",   live: true  },
  { slug: "slots",     name: "Slots",     tag: "JACKPOT", live: true  },
  { slug: "blackjack", name: "Blackjack", tag: "CLASSIC", live: true  },
  { slug: "roulette",  name: "Roulette",  tag: "CLASSIC", live: true  },
  { slug: "mines",     name: "Mines",     tag: "RISKY",   live: true  },
  { slug: "plinko",    name: "Plinko",    tag: "PHYSICS", live: true  },
  { slug: "crash",     name: "Crash",     tag: "LIVE",    live: true  },
  { slug: "poker",     name: "Poker",     tag: "MULTI",   live: false },
];

const EARN_BACKS = [
  { slug: "daily-spin",  name: "Daily Spin",  tag: "ONCE / DAY", live: true },
  { slug: "crossy-road", name: "Crossy Road", tag: "FREE",       live: true },
];

export default async function LobbyPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  const user = getUserById(s.user.id)!;
  const balance = getBalance(user.id);

  return (
    <>
      <SiteHeader current="lobby" />
      <main className="page">
        <section className="row-lg" style={{ marginBottom: "var(--sp-7)", flexWrap: "wrap" }}>
          <div className="balance-bar">
            <div className="avatar" style={{ background: user.avatar_color }}>
              {user.initials}
            </div>
            <div className="avatar-username">
              <div className="uname">{user.username}</div>
              <div className="role">PLAYER</div>
            </div>
            <div className="balance">{balance.toLocaleString()} ¢</div>
          </div>
          <SignOutButton />
        </section>

        <section style={{ marginBottom: "var(--sp-5)" }}>
          <div className="divider">Pick a Table</div>
        </section>

        <div className="grid grid-3">
          {GAMES.map((g) => (
            <Link
              key={g.slug}
              href={g.live ? `/games/${g.slug}` : "#"}
              className="tile"
              style={!g.live ? { opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" } : undefined}
              aria-disabled={!g.live || undefined}
            >
              <div className="tile-art">
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--fs-h1)",
                    color: "var(--parchment-50)",
                    textShadow: "3px 3px 0 var(--ink-900)",
                  }}
                >
                  {g.name[0]}
                </span>
              </div>
              <div className="tile-name">{g.name}</div>
              <div className="tile-meta">
                <span className={`badge ${g.live ? "badge-cactus" : ""}`}>
                  {g.live ? "OPEN" : g.tag}
                </span>
                <span>{g.live ? "Play →" : "Coming soon"}</span>
              </div>
            </Link>
          ))}
        </div>

        <section style={{ margin: "var(--sp-7) 0 var(--sp-5)" }}>
          <div className="divider">Free Coins When You're Broke</div>
        </section>

        <div className="grid grid-2">
          {EARN_BACKS.map((g) => (
            <Link
              key={g.slug}
              href={g.live ? `/earn/${g.slug}` : "#"}
              className="tile"
              style={{
                background: "var(--gold-100)",
                ...(g.live ? {} : { opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" }),
              }}
            >
              <div className="tile-name">{g.name}</div>
              <div className="tile-meta">
                <span className="badge badge-gold">{g.tag}</span>
                <span>{g.live ? "Play →" : "Coming soon"}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
