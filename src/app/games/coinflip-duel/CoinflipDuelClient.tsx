"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";

type DuelView = {
  id: string;
  challenger_id: string;
  challenger_side: "heads" | "tails";
  wager: number;
  acceptor_id: string | null;
  result: "heads" | "tails" | null;
  winner_id: string | null;
  status: "open" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
  challenger: { username: string; avatar_color: string; initials: string } | null;
  acceptor: { username: string; avatar_color: string; initials: string } | null;
};

const POLL_MS = 3000;

export function CoinflipDuelClient() {
  const router = useRouter();
  const meRef = useRef<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState<DuelView[]>([]);
  const [recent, setRecent] = useState<DuelView[]>([]);
  const [wager, setWager] = useState(1_000);
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ youWon: boolean; payout: number; result: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      meRef.current = d.user?.id ?? null;
      setBalance(d.balance ?? null);
    });
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/games/coinflip-duel/list");
      if (!r.ok) return;
      const d = await r.json();
      setOpen(d.open ?? []);
      setRecent(d.recent ?? []);
    } catch { /* ignore */ }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, []);

  async function refreshBalance() {
    const r = await fetch("/api/auth/me");
    if (r.ok) {
      const d = await r.json();
      setBalance(d.balance ?? null);
    }
  }

  async function create() {
    setBusy(true); setError(null);
    const r = await fetch("/api/games/coinflip-duel/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wager, side }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    refresh();
    router.refresh();
  }

  async function accept(id: string) {
    setBusy(true); setError(null);
    const r = await fetch(`/api/games/coinflip-duel/${id}/accept`, { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    setFlash({ youWon: d.youWon, payout: d.payout, result: d.result });
    setTimeout(() => setFlash(null), 4000);
    refresh();
    router.refresh();
  }

  async function cancel(id: string) {
    setBusy(true); setError(null);
    const r = await fetch(`/api/games/coinflip-duel/${id}/cancel`, { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    refresh();
    router.refresh();
  }

  const me = meRef.current;

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      {/* Create + open lobby */}
      <div className="stack-lg">
        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Challenge a Friend</div>
          <div className="stack-lg">
            <div>
              <label className="label">Your Side</label>
              <div className="row">
                <button
                  type="button"
                  className={`btn btn-block ${side === "heads" ? "" : "btn-ghost"}`}
                  onClick={() => setSide("heads")}
                  disabled={busy}
                >
                  Heads
                </button>
                <button
                  type="button"
                  className={`btn btn-block ${side === "tails" ? "" : "btn-ghost"}`}
                  onClick={() => setSide("tails")}
                  disabled={busy}
                >
                  Tails
                </button>
              </div>
            </div>
            <BetInput value={wager} onChange={setWager} max={Math.max(100, balance ?? 100)} disabled={busy} />
            <button
              className="btn btn-lg btn-block"
              onClick={create}
              disabled={busy || wager < 100 || (balance != null && balance < wager)}
            >
              {busy ? "..." : `Post Challenge (${wager.toLocaleString()} ¢)`}
            </button>
            {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
            {flash && (
              <div
                className="sign"
                style={{
                  display: "block",
                  textAlign: "center",
                  background: flash.youWon ? "var(--cactus-500)" : "var(--crimson-500)",
                }}
              >
                {flash.result.toUpperCase()} ·{" "}
                {flash.youWon ? `+${flash.payout.toLocaleString()} ¢` : "Lost the duel"}
              </div>
            )}
          </div>
        </div>

        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Open Duels ({open.length})</div>
          {open.length === 0 ? (
            <p className="text-mute">No open challenges. Be the first.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {open.map((d) => {
                const isMine = d.challenger_id === me;
                const otherSide = d.challenger_side === "heads" ? "tails" : "heads";
                return (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "var(--sp-3)",
                      background: isMine ? "var(--gold-100)" : "var(--parchment-200)",
                      border: "2px solid var(--ink-900)",
                    }}
                  >
                    <div
                      className="avatar avatar-sm"
                      style={{
                        background: d.challenger?.avatar_color ?? "var(--gold-300)",
                        fontSize: 13,
                        width: 28,
                        height: 28,
                        borderWidth: 2,
                      }}
                    >
                      {d.challenger?.initials ?? "??"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 14 }}>
                      <div>
                        {d.challenger?.username ?? "?"} picks <b>{d.challenger_side.toUpperCase()}</b>
                      </div>
                      <div style={{ color: "var(--saddle-400)", fontSize: 12 }}>
                        Wager {d.wager.toLocaleString()} ¢ · pot {(d.wager * 2).toLocaleString()} ¢
                      </div>
                    </div>
                    {isMine ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => cancel(d.id)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => accept(d.id)}
                        disabled={busy || (balance != null && balance < d.wager)}
                      >
                        Take {otherSide.toUpperCase()}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Recent Duels</div>
        {recent.length === 0 ? (
          <p className="text-mute">No duels yet. Set the first wager.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {recent.map((d) => {
              const youWere =
                d.challenger_id === me ? "challenger" :
                d.acceptor_id === me ? "acceptor" : null;
              const isResolved = d.status === "resolved";
              const youWon = isResolved && d.winner_id === me;
              const otherUser = d.challenger_id === me ? d.acceptor : d.challenger;
              return (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "var(--sp-3)",
                    background:
                      d.status === "cancelled"
                        ? "var(--parchment-200)"
                        : youWon
                        ? "var(--cactus-100)"
                        : youWere
                        ? "var(--crimson-100)"
                        : "var(--parchment-100)",
                    border: "2px solid var(--ink-900)",
                  }}
                >
                  <div
                    className="avatar avatar-sm"
                    style={{
                      background: d.challenger?.avatar_color ?? "var(--gold-300)",
                      fontSize: 13,
                      width: 28,
                      height: 28,
                      borderWidth: 2,
                    }}
                  >
                    {d.challenger?.initials ?? "??"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 13 }}>
                    {d.status === "cancelled" ? (
                      <span>{d.challenger?.username ?? "?"} cancelled · {d.wager.toLocaleString()} ¢</span>
                    ) : (
                      <>
                        <div>
                          {d.challenger?.username} ({d.challenger_side.toUpperCase()}) vs{" "}
                          {d.acceptor?.username ?? "?"}
                        </div>
                        <div style={{ color: "var(--saddle-400)", fontSize: 12 }}>
                          Result: <b>{d.result?.toUpperCase()}</b> · pot {(d.wager * 2).toLocaleString()} ¢
                        </div>
                      </>
                    )}
                  </div>
                  {youWere && isResolved && (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        color: youWon ? "var(--cactus-500)" : "var(--crimson-500)",
                      }}
                    >
                      {youWon ? `+${(d.wager * 2).toLocaleString()}` : `-${d.wager.toLocaleString()}`}
                    </span>
                  )}
                  {otherUser && !youWere && d.status === "resolved" && (
                    <span style={{ color: "var(--saddle-400)", fontSize: 12 }}>
                      {d.winner_id === d.challenger_id ? d.challenger?.username : d.acceptor?.username} won
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor(code: string) {
  const m: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Wager must be at least 100.",
    side_invalid: "Pick heads or tails.",
    not_found: "Duel not found.",
    not_open: "Duel already closed.",
    cant_accept_own: "Can't accept your own challenge.",
    not_yours: "You can only cancel your own challenges.",
  };
  return m[code] ?? "Something went wrong.";
}
