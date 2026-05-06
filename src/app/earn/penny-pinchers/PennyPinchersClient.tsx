"use client";

// Penny Pinchers — framework scaffold. Gameplay rules are pending;
// this page exists so the lobby tile + Free Games modal entry route
// somewhere instead of 404'ing while we design the actual game.

import { GameIcon } from "@/components/GameIcon";

export function PennyPinchersClient() {
  return (
    <section
      className="panel"
      style={{
        padding: "var(--sp-5)",
        textAlign: "center",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "var(--sp-4)" }}>
        <div
          style={{
            width: 160,
            aspectRatio: "16 / 9",
            margin: "0 auto",
            border: "3px solid var(--ink-900)",
            overflow: "hidden",
            background: "var(--saddle-300)",
          }}
        >
          <GameIcon name="lobby.penny_pinchers" size={160} />
        </div>
      </div>

      <h2
        className="uppercase"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-h2)",
          color: "var(--gold-300)",
          letterSpacing: "var(--ls-loose)",
          textShadow: "2px 2px 0 var(--ink-900)",
          margin: 0,
          marginBottom: "var(--sp-2)",
        }}
      >
        Penny Pinchers
      </h2>

      <span
        className="badge badge-gold"
        style={{ fontSize: 11, marginBottom: "var(--sp-3)", display: "inline-block" }}
      >
        COMING SOON
      </span>

      <p style={{ marginBottom: "var(--sp-3)" }}>
        We&rsquo;re cooking up a new free-coins game called Penny Pinchers.
      </p>

      <p className="text-mute" style={{ fontSize: 13 }}>
        Check back soon — until then, the other free games on the modal will
        keep your stack topped up.
      </p>
    </section>
  );
}
