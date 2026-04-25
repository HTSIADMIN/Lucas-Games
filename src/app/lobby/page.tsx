"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { PLACEHOLDER_PLAYERS } from "@/lib/placeholderPlayers";

const GAMES = [
  { slug: "blackjack", name: "Blackjack", tag: "CLASSIC" },
  { slug: "slots",     name: "Slots",     tag: "JACKPOT" },
  { slug: "poker",     name: "Poker",     tag: "MULTI" },
  { slug: "plinko",    name: "Plinko",    tag: "PHYSICS" },
  { slug: "coinflip",  name: "Coin Flip", tag: "QUICK" },
  { slug: "mines",     name: "Mines",     tag: "RISKY" },
  { slug: "dice",      name: "Dice",      tag: "QUICK" },
  { slug: "crash",     name: "Crash",     tag: "LIVE" },
  { slug: "roulette",  name: "Roulette",  tag: "CLASSIC" },
];

export default function LobbyPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState<string>("");

  useEffect(() => {
    const id = sessionStorage.getItem("lg_player");
    if (!id) {
      router.replace("/sign-in");
      return;
    }
    if (id.startsWith("new:")) {
      setPlayerName(id.slice(4));
    } else {
      const p = PLACEHOLDER_PLAYERS.find((pp) => pp.id === id);
      setPlayerName(p?.username ?? "Stranger");
    }
  }, [router]);

  function signOut() {
    sessionStorage.removeItem("lg_player");
    router.push("/sign-in");
  }

  return (
    <>
      <SiteHeader current="lobby" />
      <main className="page">
        <section className="row-lg" style={{ marginBottom: "var(--sp-7)", flexWrap: "wrap" }}>
          <div className="balance-bar">
            <div className="avatar">
              {playerName ? playerName.slice(0, 2).toUpperCase() : "..."}
            </div>
            <div className="avatar-username">
              <div className="uname">{playerName || "..."}</div>
              <div className="role">PLAYER</div>
            </div>
            <div className="balance">500,000 ¢</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </section>

        <section style={{ marginBottom: "var(--sp-5)" }}>
          <div className="divider">Pick a Table</div>
        </section>

        <div className="grid grid-3">
          {GAMES.map((g) => (
            <Link key={g.slug} href={`/games/${g.slug}`} className="tile">
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
                <span className="badge">{g.tag}</span>
                <span>Coming soon →</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
