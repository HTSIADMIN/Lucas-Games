"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLACEHOLDER_PLAYERS, type PlaceholderPlayer } from "@/lib/placeholderPlayers";

export default function SignInPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<PlaceholderPlayer | null>(null);
  const [creating, setCreating] = useState(false);
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPin, setNewPin] = useState("");

  function press(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4 && selected) {
      if (next === selected.pin) {
        sessionStorage.setItem("lg_player", selected.id);
        router.push("/lobby");
      } else {
        setShaking(true);
        setTimeout(() => {
          setShaking(false);
          setPin("");
        }, 500);
      }
    }
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  function reset() {
    setSelected(null);
    setCreating(false);
    setPin("");
    setNewUsername("");
    setNewPin("");
  }

  function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (newUsername.trim().length < 2) return;
    if (!/^\d{4}$/.test(newPin)) return;
    sessionStorage.setItem("lg_player", "new:" + newUsername);
    router.push("/lobby");
  }

  // ============ AVATAR GRID ============
  if (!selected && !creating) {
    return (
      <main className="page">
        <div style={{ textAlign: "center", marginBottom: "var(--sp-7)" }}>
          <div className="sign" style={{ fontSize: "var(--fs-h2)" }}>Welcome to the Saloon</div>
          <p className="text-mute" style={{ marginTop: "var(--sp-4)" }}>
            Pick your seat at the table — or pull up a new chair.
          </p>
        </div>

        <div className="grid grid-4">
          {PLACEHOLDER_PLAYERS.map((p) => (
            <button
              key={p.id}
              className="tile"
              onClick={() => setSelected(p)}
              style={{ alignItems: "center", textAlign: "center" }}
            >
              <div
                className="avatar avatar-lg"
                style={{ background: p.avatarColor, fontSize: "var(--fs-h2)" }}
              >
                {p.initials}
              </div>
              <div className="tile-name">{p.username}</div>
              <div className="tile-meta" style={{ width: "100%", justifyContent: "center" }}>
                <span className="badge badge-gold">RANK {p.rank}</span>
              </div>
            </button>
          ))}

          <button
            className="tile"
            onClick={() => setCreating(true)}
            style={{
              alignItems: "center",
              textAlign: "center",
              background: "var(--parchment-200)",
              borderStyle: "dashed",
            }}
          >
            <div
              className="avatar avatar-lg"
              style={{
                background: "var(--parchment-50)",
                fontSize: "var(--fs-display)",
                color: "var(--saddle-400)",
              }}
            >
              +
            </div>
            <div className="tile-name">New Player</div>
            <div className="tile-meta" style={{ width: "100%", justifyContent: "center" }}>
              <span className="badge">SIT DOWN</span>
            </div>
          </button>
        </div>
      </main>
    );
  }

  // ============ NEW PLAYER FORM ============
  if (creating) {
    return (
      <main className="page" style={{ maxWidth: "560px" }}>
        <form onSubmit={createAccount} className="panel" style={{ padding: "var(--sp-7)" }}>
          <h2 className="panel-title" style={{ fontSize: "var(--fs-h2)" }}>New Player</h2>

          <div style={{ marginBottom: "var(--sp-5)" }}>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              maxLength={16}
              autoFocus
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="What do they call you?"
            />
          </div>

          <div style={{ marginBottom: "var(--sp-6)" }}>
            <label className="label" htmlFor="newpin">4-Digit PIN</label>
            <input
              id="newpin"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
            />
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              ← Back
            </button>
            <button
              type="submit"
              className="btn"
              disabled={newUsername.trim().length < 2 || !/^\d{4}$/.test(newPin)}
            >
              Sit Down
            </button>
          </div>
        </form>
      </main>
    );
  }

  // ============ PIN PAD ============
  return (
    <main className="page" style={{ maxWidth: "440px" }}>
      <div className="panel" style={{ padding: "var(--sp-7)", textAlign: "center" }}>
        <div
          className="avatar avatar-lg"
          style={{
            background: selected!.avatarColor,
            fontSize: "var(--fs-h2)",
            margin: "0 auto var(--sp-4)",
          }}
        >
          {selected!.initials}
        </div>
        <h2 style={{ fontSize: "var(--fs-h2)", marginBottom: "var(--sp-2)" }}>
          {selected!.username}
        </h2>
        <p className="text-mute" style={{ marginBottom: "var(--sp-5)" }}>
          Enter your 4-digit PIN
        </p>

        <div className={`pin-display ${shaking ? "pin-shake" : ""}`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`pin-dot ${i < pin.length ? "is-filled" : ""}`} />
          ))}
        </div>

        <div className="pinpad" style={{ marginBottom: "var(--sp-5)" }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)}>{d}</button>
          ))}
          <button type="button" onClick={backspace} aria-label="backspace">←</button>
          <button type="button" onClick={() => press("0")}>0</button>
          <button type="button" onClick={() => setPin("")} aria-label="clear">C</button>
        </div>

        <button type="button" className="btn btn-ghost btn-block" onClick={reset}>
          ← Pick someone else
        </button>

        <p className="text-mute" style={{ fontSize: "var(--fs-tiny)", marginTop: "var(--sp-4)" }}>
          (placeholder data — try PIN 0000)
        </p>
      </div>
    </main>
  );
}
