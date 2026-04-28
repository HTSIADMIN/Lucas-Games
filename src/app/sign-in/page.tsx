"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import * as Sfx from "@/lib/sfx";

type Player = {
  id: string;
  username: string;
  avatar_color: string;
  initials: string;
  equipped_frame?: string | null;
  equipped_hat?: string | null;
};

export default function SignInPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [championId, setChampionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Player | null>(null);
  const [creating, setCreating] = useState(false);
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    fetch("/api/auth/players")
      .then((r) => r.json())
      .then((d) => {
        setPlayers(d.players ?? []);
        setChampionId(d.championId ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function press(digit: string) {
    if (pin.length >= 4 || submitting) return;
    Sfx.play("ui.click");
    const next = pin + digit;
    setPin(next);
    if (next.length === 4 && selected) {
      setSubmitting(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selected.id, pin: next }),
      });
      if (res.ok) {
        Sfx.play("win.levelup");
        router.push("/lobby");
      } else {
        const data = await res.json().catch(() => ({}));
        Sfx.play("ui.notify");
        setShaking(true);
        setTimeout(() => {
          setShaking(false);
          setPin("");
          setSubmitting(false);
          if (data.error === "too_many_attempts") {
            setErrorMsg("Too many tries. Take five.");
          } else {
            setErrorMsg("Wrong PIN. Try again.");
          }
        }, 500);
      }
    }
  }

  function backspace() { Sfx.play("ui.click"); setPin((p) => p.slice(0, -1)); }
  function clearPin() { Sfx.play("ui.click"); setPin(""); }

  function reset() {
    setSelected(null);
    setCreating(false);
    setPin("");
    setNewUsername("");
    setNewPin("");
    setErrorMsg(null);
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (newUsername.trim().length < 2) return;
    if (!/^\d{4}$/.test(newPin)) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: newUsername.trim(), pin: newPin }),
    });
    if (res.ok) {
      router.push("/lobby");
    } else {
      const data = await res.json().catch(() => ({}));
      const msg: Record<string, string> = {
        username_taken: "That name's already taken.",
        username_length: "Name must be 2–16 characters.",
        username_chars: "Letters, numbers, spaces, dashes, underscores only.",
        pin_format: "PIN must be exactly 4 digits.",
      };
      setErrorMsg(msg[data.error] ?? "Could not create player.");
      setSubmitting(false);
    }
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

        {loading ? (
          <p className="text-mute" style={{ textAlign: "center" }}>Loading players...</p>
        ) : (
          <div className="grid grid-4">
            {players.map((p) => (
              <button
                key={p.id}
                className="tile"
                onClick={() => setSelected(p)}
                style={{ alignItems: "center", textAlign: "center" }}
              >
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 4 }}>
                  <Avatar
                    initials={p.initials}
                    color={p.avatar_color}
                    size={88}
                    fontSize={28}
                    frame={p.equipped_frame ?? null}
                    hat={p.equipped_hat ?? null}
                    champion={p.id === championId}
                  />
                </div>
                <div className="tile-name">{p.username}</div>
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
        )}

        {players.length === 0 && !loading && (
          <p className="text-mute" style={{ textAlign: "center", marginTop: "var(--sp-5)" }}>
            No one's here yet. Pull up a new chair to get started.
          </p>
        )}
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

          {errorMsg && (
            <p style={{ color: "var(--crimson-500)", marginBottom: "var(--sp-3)" }}>{errorMsg}</p>
          )}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              ← Back
            </button>
            <button
              type="submit"
              className="btn"
              disabled={submitting || newUsername.trim().length < 2 || !/^\d{4}$/.test(newPin)}
            >
              {submitting ? "Saddling up..." : "Sit Down"}
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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--sp-4)" }}>
          <Avatar
            initials={selected!.initials}
            color={selected!.avatar_color}
            size={104}
            fontSize={36}
            frame={selected!.equipped_frame ?? null}
            hat={selected!.equipped_hat ?? null}
            champion={selected!.id === championId}
          />
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

        {errorMsg && (
          <p style={{ color: "var(--crimson-500)", marginBottom: "var(--sp-3)" }}>{errorMsg}</p>
        )}

        <div className="pinpad" style={{ marginBottom: "var(--sp-5)" }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} disabled={submitting}>{d}</button>
          ))}
          <button type="button" onClick={backspace} aria-label="backspace" disabled={submitting}>←</button>
          <button type="button" onClick={() => press("0")} disabled={submitting}>0</button>
          <button type="button" onClick={clearPin} aria-label="clear" disabled={submitting}>C</button>
        </div>

        <button type="button" className="btn btn-ghost btn-block" onClick={reset}>
          ← Pick someone else
        </button>
      </div>
    </main>
  );
}
