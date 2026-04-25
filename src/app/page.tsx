export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-7)",
        gap: "var(--sp-6)",
      }}
    >
      <section
        style={{
          background: "var(--saddle-500)",
          border: "4px solid var(--ink-900)",
          padding: "var(--sp-8) var(--sp-7)",
          color: "var(--parchment-50)",
          boxShadow: "var(--sh-table)",
          position: "relative",
          maxWidth: "820px",
          width: "100%",
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(74,40,24,0.15) 0, rgba(74,40,24,0.15) 2px, transparent 2px, transparent 8px), repeating-linear-gradient(0deg, rgba(255,233,168,0.06) 0, rgba(255,233,168,0.06) 1px, transparent 1px, transparent 16px)",
        }}
      >
        <div
          style={{
            background: "var(--gold-300)",
            color: "var(--ink-900)",
            border: "2px solid var(--ink-900)",
            padding: "2px 8px",
            display: "inline-block",
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-small)",
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
            marginBottom: "var(--sp-4)",
          }}
        >
          Saloon Opens Soon
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "96px",
            lineHeight: 0.9,
            letterSpacing: "var(--ls-display)",
            color: "var(--gold-300)",
            textShadow: "4px 4px 0 var(--saddle-600), 8px 8px 0 var(--ink-900)",
            textTransform: "uppercase",
            marginBottom: "var(--sp-3)",
          }}
        >
          Lucas
          <br />
          Games
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h4)",
            color: "var(--parchment-200)",
            textShadow: "2px 2px 0 var(--saddle-600)",
            letterSpacing: "var(--ls-loose)",
          }}
        >
          A pixel saloon for the wild west of mini-games.
        </div>
      </section>

      <section
        style={{
          background: "var(--parchment-100)",
          border: "4px solid var(--ink-900)",
          padding: "var(--sp-5) var(--sp-6)",
          boxShadow: "var(--sh-card-rest)",
          maxWidth: "820px",
          width: "100%",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h4)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-loose)",
            color: "var(--ink-900)",
            marginBottom: "var(--sp-3)",
          }}
        >
          Coming up next
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--sp-3)",
            color: "var(--saddle-400)",
          }}
        >
          {[
            "Sign in with PIN",
            "Wallet of Coins",
            "Blackjack",
            "Slots",
            "Poker",
            "Plinko",
            "Coin Flip",
            "Mines",
            "Dice",
            "Crash",
            "Roulette",
            "Daily Spin",
            "Crossy Road",
            "Leaderboard",
            "Cosmetic shop",
          ].map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </section>

      <footer
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-small)",
          color: "var(--saddle-400)",
          letterSpacing: "var(--ls-loose)",
        }}
      >
        Phase 0 · Foundation up · localhost only
      </footer>
    </main>
  );
}
