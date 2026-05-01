"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { bucketTable, type PlinkoRisk, type PlinkoRows } from "@/lib/games/plinko/engine";
import * as Sfx from "@/lib/sfx";

// Vertical pixel height per row.
const ROW_H = 30;
// Top padding (above first peg) and bottom padding (peg row → bucket gap).
const TOP_PAD = 28;
const BOT_PAD = 14;

// =============================================================
// V2 PHYSICS — gravity-driven simulation with per-peg collisions.
// The server still decides which bucket the ball lands in; the
// client samples the ball's trajectory deterministically from a
// list of L/R decisions that sum to the target bucket. Each peg
// collision applies a horizontal velocity kick + a damped vertical
// bounce so the ball jiggles + settles instead of gliding.
//
// All units are normalized: x ∈ [0..1] of the board width, y ∈
// [0..~1] of the peg-field height. The renderer maps x to % and y
// to row-pixel offsets.
// =============================================================

type PhysSample = { ms: number; x: number; y: number; rot: number; bounce: boolean };
type PegHit = { ms: number; row: number; k: number; x: number };

const GRAVITY = 0.000045; // normalized y units / ms²
const AIR_FRICTION_PER_MS = 0.0006;
const BOUNCE_VY_DAMP = 0.32;     // 1 → no energy loss, 0 → dead stop
const BOUNCE_VY_KICK = 0.00012;  // small upward shove off each peg
const BALL_RADIUS = 0.012;       // for collision lookahead (normalized)
const SIM_DT = 12;               // ms per integration step
const SIM_MAX_MS = 6500;

function makeDecisions(rows: number, targetBucket: number): number[] {
  const rights = Math.max(0, Math.min(rows, targetBucket));
  const lefts = rows - rights;
  const arr: number[] = [];
  for (let i = 0; i < rights; i++) arr.push(1);
  for (let i = 0; i < lefts; i++) arr.push(-1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function simulateDrop(rows: number, targetBucket: number): {
  samples: PhysSample[];
  totalMs: number;
  hits: PegHit[];
} {
  const decisions = makeDecisions(rows, targetBucket);
  const pegSpread = 1 / (rows + 1); // distance between adjacent pegs in same row
  const samples: PhysSample[] = [];
  const hits: PegHit[] = [];

  let x = 0.5;
  let y = -0.04;
  let vx = 0;
  let vy = 0;
  let rot = 0;
  let ms = 0;
  let nextPeg = 0;
  // Cumulative side count tracks which peg in the current row the
  // ball is closest to. Each row r has (r+1) pegs at columns
  // 0..r — column k = passes_right_so_far. `R` rises on every
  // right decision, so the peg tagged for row r is k = R-at-time-
  // of-collision (before this row's decision is applied).
  let R = 0;

  samples.push({ ms, x, y, rot, bounce: false });

  while (ms < SIM_MAX_MS) {
    // Integrate forces
    vy += GRAVITY * SIM_DT;
    vx *= 1 - AIR_FRICTION_PER_MS * SIM_DT;
    x += vx * SIM_DT;
    y += vy * SIM_DT;
    rot += vx * SIM_DT * 1800; // visual spin scales with horizontal speed
    let bounced = false;

    // Peg collision check — when y crosses the next peg row, apply
    // the deterministic decision as a horizontal velocity, bounce
    // the ball up slightly, and clear the peg so we don't double-
    // hit on the next frame.
    if (nextPeg < rows) {
      const pegY = (nextPeg + 1) / (rows + 1);
      if (y >= pegY - BALL_RADIUS) {
        const dir = decisions[nextPeg];
        // Record which peg got hit so the renderer can flash it
        // and emit dust particles. Peg index k = R passes-right.
        const pegIndex = R;
        const pegXNorm = pegX(rows, nextPeg, pegIndex);
        hits.push({ ms, row: nextPeg, k: pegIndex, x: pegXNorm });
        // Horizontal kick that lands the ball roughly on the next
        // column within a typical step time. Add ±15% chaos so
        // every drop reads a touch differently.
        const baseVx = (dir * pegSpread * 0.55) / 130;
        vx = baseVx * (0.85 + Math.random() * 0.3);
        // Bounce — invert + dampen + small upward shove.
        vy = -Math.abs(vy) * BOUNCE_VY_DAMP - BOUNCE_VY_KICK;
        // Nudge past the peg so the next frame doesn't re-trigger.
        y = pegY + 0.002;
        if (dir === 1) R++;
        nextPeg++;
        bounced = true;
      }
    }

    // Side walls — gentle clamp so a chaotic high-bet ball doesn't
    // fly off the board on edge drops.
    if (x < 0.02) { x = 0.02; vx = Math.abs(vx) * 0.5; }
    if (x > 0.98) { x = 0.98; vx = -Math.abs(vx) * 0.5; }

    ms += SIM_DT;
    samples.push({ ms, x, y, rot, bounce: bounced });

    // Stop once the ball passes the bucket lip.
    if (y >= 1.04) break;
  }

  // Settle pause so the bucket flash has a beat to read.
  for (let extra = 0; extra < 6; extra++) {
    ms += SIM_DT;
    samples.push({ ms, x, y, rot, bounce: false });
  }
  return { samples, totalMs: ms, hits };
}

/** Threshold at which a landing gets the slow-mo cinematic. */
const SLOWMO_MIN_MULTIPLIER = 10;
/** Sim time runs at this fraction of wall time during slow-mo. */
const SLOWMO_FACTOR = 0.4;

/** Wall-clock → sim-clock mapper. Hits happen during the linear
 *  (1:1) window before the last peg-collision; after that point
 *  sim time advances at SLOWMO_FACTOR × wall time so the final
 *  fall + bucket settle reads as cinematic on a big win. */
function wallToSim(wallElapsed: number, opts: {
  slowMo: boolean;
  lastHitSimMs: number;
}): number {
  if (!opts.slowMo) return wallElapsed;
  if (wallElapsed <= opts.lastHitSimMs) return wallElapsed;
  return opts.lastHitSimMs + (wallElapsed - opts.lastHitSimMs) * SLOWMO_FACTOR;
}

/** Compute the wall duration a slow-mo ball spends in the air —
 *  used for the bucket-flash setTimeout + ball cleanup. */
function wallDuration(simTotalMs: number, slowMo: boolean, lastHitSimMs: number): number {
  if (!slowMo) return simTotalMs;
  return lastHitSimMs + (simTotalMs - lastHitSimMs) / SLOWMO_FACTOR;
}

/** Lookup the simulated position at `elapsed` ms with a tiny lerp
 *  between adjacent samples for sub-frame smoothness. */
function sampleAt(samples: PhysSample[], elapsed: number): PhysSample {
  if (samples.length === 0) return { ms: 0, x: 0.5, y: 0, rot: 0, bounce: false };
  if (elapsed <= 0) return samples[0];
  if (elapsed >= samples[samples.length - 1].ms) return samples[samples.length - 1];
  const idx = Math.min(samples.length - 1, Math.floor(elapsed / SIM_DT));
  const a = samples[idx];
  const b = samples[Math.min(samples.length - 1, idx + 1)];
  const span = Math.max(1, b.ms - a.ms);
  const t = Math.min(1, Math.max(0, (elapsed - a.ms) / span));
  return {
    ms: elapsed,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    rot: a.rot + (b.rot - a.rot) * t,
    bounce: a.bounce || b.bounce,
  };
}

// Peg position in row r (0-indexed, 0..rows-1), peg index k (0..r), normalized 0..1.
function pegX(rows: number, r: number, k: number) {
  return ((rows - r) / 2 + k + 0.5) / (rows + 1);
}

type DropResult = {
  bucket: number;
  multiplier: number;
  payout: number;
  table: number[];
  rows: PlinkoRows;
  risk: PlinkoRisk;
  balance: number;
};

const ROW_OPTIONS: PlinkoRows[] = [8, 12, 16];
const RISK_OPTIONS: { value: PlinkoRisk; label: string }[] = [
  { value: "low",  label: "LOW" },
  { value: "med",  label: "MED" },
  { value: "high", label: "HIGH" },
];

type Ghost = {
  id: string;
  username: string;
  avatarColor: string;
  initials: string;
  rows: PlinkoRows;
  bucket: number;
  startedAt: number; // when we mounted it locally
};

type FlyingBall = {
  id: string;
  samples: PhysSample[];
  hits: PegHit[];
  totalMs: number;
  /** Real wall-clock duration the ball spends in the air. Equal
   *  to totalMs unless slowMo is on, in which case the
   *  post-final-peg fall is stretched. */
  wallTotalMs: number;
  /** When true, the bucket settle is animated in slow motion to
   *  punctuate a big-multiplier landing. */
  slowMo: boolean;
  rows: number;
  startedAtMs: number;
  multiplier: number;
  payout: number;
  bet: number;
  bucket: number;
};

export function PlinkoClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("med");
  const [submitting, setSubmitting] = useState(false);
  const [balls, setBalls] = useState<FlyingBall[]>([]);
  const [bucketFlashes, setBucketFlashes] = useState<{ bucket: number; at: number }[]>([]);
  const [result, setResult] = useState<DropResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ghosts, setGhosts] = useState<(Ghost & { samples: PhysSample[]; hits: PegHit[]; totalMs: number; startedAtMs: number })[]>([]);
  const [, setTick] = useState(0);
  // Track which (ballId, hitIndex) combinations have already fired
  // their tick sound, so the rAF loop can play a soft pin-tick the
  // moment the elapsed time crosses each peg-hit timestamp without
  // double-firing on subsequent frames.
  const playedHitsRef = useRef<Map<string, Set<number>>>(new Map());

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  // Poll for other players' recent drops and spawn ghost chips on our board.
  useEffect(() => {
    const seen = new Set<string>();
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch("/api/games/plinko/recent");
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled || !Array.isArray(d.drops)) return;
        const now = Date.now();
        for (const drop of d.drops as Array<{
          id: string; username: string; avatarColor: string; initials: string;
          rows: number; bucket: number; at: number;
        }>) {
          if (seen.has(drop.id)) continue;
          if (now - drop.at > 5000) {
            seen.add(drop.id);
            continue;
          }
          seen.add(drop.id);
          const sim = simulateDrop(drop.rows, drop.bucket);
          setGhosts((prev) => [...prev, {
            id: drop.id,
            username: drop.username,
            avatarColor: drop.avatarColor,
            initials: drop.initials,
            rows: drop.rows as PlinkoRows,
            bucket: drop.bucket,
            startedAt: drop.at,
            samples: sim.samples,
            hits: sim.hits,
            totalMs: sim.totalMs,
            startedAtMs: Date.now(),
          }]);
          setTimeout(() => {
            setGhosts((prev) => prev.filter((x) => x.id !== drop.id));
          }, sim.totalMs + 300);
        }
      } catch { /* ignore */ }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Drive the render off requestAnimationFrame while balls or
  // ghosts are in flight — smoother than a 50ms interval and
  // avoids layout thrash when the tab is backgrounded. Also fires
  // a soft pin-tick the moment the ball reaches each peg, ref-
  // tracked so the same hit can't double-play across frames.
  useEffect(() => {
    if (balls.length === 0 && ghosts.length === 0 && bucketFlashes.length === 0) return;
    let raf = 0;
    function frame() {
      const now = Date.now();
      // Walk both ball lists and play any hits whose ms has been
      // crossed but haven't been played yet. Ghost hits get ticked
      // at lower volume via ui.click is fine — a single quiet
      // "pin" works for both.
      const fire = (ballId: string, hits: PegHit[], startedAt: number) => {
        const elapsed = now - startedAt;
        const played = playedHitsRef.current.get(ballId) ?? new Set<number>();
        for (let i = 0; i < hits.length; i++) {
          if (played.has(i)) continue;
          if (hits[i].ms <= elapsed) {
            played.add(i);
            Sfx.play("ui.click");
          }
        }
        playedHitsRef.current.set(ballId, played);
      };
      for (const b of balls) fire(b.id, b.hits, b.startedAtMs);
      for (const g of ghosts) fire(g.id, g.hits, g.startedAtMs);
      setTick((n) => (n + 1) & 0xffff);
      setBucketFlashes((prev) => prev.filter((f) => now - f.at < 800));
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [balls, ghosts, bucketFlashes.length]);

  // Garbage-collect played-hit tracker when balls / ghosts leave.
  useEffect(() => {
    const ids = new Set<string>([...balls.map((b) => b.id), ...ghosts.map((g) => g.id)]);
    for (const k of playedHitsRef.current.keys()) {
      if (!ids.has(k)) playedHitsRef.current.delete(k);
    }
  }, [balls, ghosts]);

  const previewTable = bucketTable(rows, risk);

  async function go() {
    if (bet < 100) return;
    if (balance != null && balance < bet) return;
    setError(null);
    setSubmitting(true);
    // Optimistic balance debit so rapid clicks reflect immediately.
    const stake = bet;
    const localRows = rows;
    setBalance((b) => (b == null ? b : b - stake));

    try {
      const res = await fetch("/api/games/plinko/drop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bet: stake, rows: localRows, risk }),
      });
      const data = await res.json();
      setSubmitting(false);
      if (!res.ok) {
        // Roll back optimistic balance on failure.
        setBalance((b) => (b == null ? b : b + stake));
        setError(data.error ?? "error");
        return;
      }

      // Soft UI tick on the drop — the original coin.drop was too
      // weighty for a button press.
      Sfx.play("ui.click");
      // Spawn a new flying ball with its own simulated trajectory.
      const sim = simulateDrop(localRows, data.bucket);
      const lastHitSimMs = sim.hits.length > 0 ? sim.hits[sim.hits.length - 1].ms : sim.totalMs;
      const slowMo = (data.multiplier ?? 0) >= SLOWMO_MIN_MULTIPLIER;
      const wallTotalMs = wallDuration(sim.totalMs, slowMo, lastHitSimMs);
      const id = crypto.randomUUID();
      const startedAtMs = Date.now();
      const ball: FlyingBall = {
        id,
        samples: sim.samples,
        hits: sim.hits,
        totalMs: sim.totalMs,
        wallTotalMs,
        slowMo,
        rows: localRows,
        startedAtMs,
        multiplier: data.multiplier,
        payout: data.payout,
        bet: stake,
        bucket: data.bucket,
      };
      setBalls((prev) => [...prev, ball]);

      const animMs = wallTotalMs;
      // When the ball "lands", flash the bucket + record result + sync balance.
      setTimeout(() => {
        setBucketFlashes((prev) => [...prev, { bucket: data.bucket, at: Date.now() }]);
        setResult(data);
        // Server-truth balance — overrides optimistic if any drift.
        setBalance(data.balance);
        // Tier-scale the landing chime by multiplier. Light hits use
        // the new chips-collide for a quick poker-table clack.
        const m = data.multiplier ?? 0;
        if (m >= 50)      Sfx.play("win.big");
        else if (m >= 5)  Sfx.play("win.levelup");
        else if (m >= 1)  Sfx.play("chips.collide");
        else              Sfx.play("ui.notify");
        // Remove the ball after a small landing pause.
        setTimeout(() => {
          setBalls((prev) => prev.filter((b) => b.id !== id));
        }, 350);
        router.refresh();
      }, animMs);
    } catch (err) {
      setSubmitting(false);
      setBalance((b) => (b == null ? b : b + stake));
      setError("network_error");
    }
  }

  const canDrop = bet >= 100 && (balance == null || balance >= bet);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Board</div>

        {(() => {
          const boardHeight = TOP_PAD + ROW_H * rows + BOT_PAD;
          return (
            <div
              style={{
                background: "var(--saddle-500)",
                border: "4px solid var(--ink-900)",
                padding: 8,
              }}
            >
              {/* Peg field */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: boardHeight,
                  background: "var(--saddle-600)",
                  border: "2px solid var(--ink-900)",
                  overflow: "hidden",
                }}
              >
                {/* Pegs — flash gold + scale up briefly when the
                    ball strikes them. We compute hit recency by
                    walking every active ball / ghost and taking
                    the freshest hit on each (row, k). */}
                {(() => {
                  const nowTs = Date.now();
                  // Map peg key → newest age in ms (smaller = fresher).
                  const recentHits = new Map<string, number>();
                  for (const b of balls) {
                    if (b.rows !== rows) continue;
                    for (const h of b.hits) {
                      const age = nowTs - (b.startedAtMs + h.ms);
                      if (age < 0 || age > 320) continue;
                      const key = `${h.row}-${h.k}`;
                      const prev = recentHits.get(key);
                      if (prev == null || age < prev) recentHits.set(key, age);
                    }
                  }
                  for (const g of ghosts) {
                    if (g.rows !== rows) continue;
                    for (const h of g.hits) {
                      const age = nowTs - (g.startedAtMs + h.ms);
                      if (age < 0 || age > 320) continue;
                      const key = `${h.row}-${h.k}`;
                      const prev = recentHits.get(key);
                      if (prev == null || age < prev) recentHits.set(key, age);
                    }
                  }
                  return Array.from({ length: rows }).map((_, r) =>
                    Array.from({ length: r + 1 }).map((_, k) => {
                      const xPct = pegX(rows, r, k) * 100;
                      const yPx = TOP_PAD + r * ROW_H;
                      const age = recentHits.get(`${r}-${k}`);
                      const flashing = age != null;
                      // 0..1 strength that decays with age (0ms = 1, 320ms = 0).
                      const t = flashing ? Math.max(0, 1 - age / 320) : 0;
                      const scale = 1 + t * 0.55;
                      const glow = flashing
                        ? `0 0 0 2px var(--ink-900), 0 0 ${10 + t * 16}px rgba(255, 216, 77, ${0.4 + t * 0.55}), inset -1px -2px 0 rgba(26,15,8,0.4), inset 1px 1px 0 rgba(255,255,255,0.6)`
                        : "0 0 0 2px var(--ink-900), inset -1px -2px 0 rgba(26,15,8,0.4), inset 1px 1px 0 rgba(255,255,255,0.6)";
                      const fill = flashing ? "#ffd84d" : "var(--gold-100)";
                      return (
                        <span
                          key={`${r}-${k}`}
                          style={{
                            position: "absolute",
                            left: `${xPct}%`,
                            top: yPx,
                            transform: `translate(-50%, -50%) scale(${scale})`,
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: fill,
                            boxShadow: glow,
                            transition: flashing ? "none" : "transform 120ms ease-out, box-shadow 120ms",
                          }}
                        />
                      );
                    })
                  );
                })()}

                {/* Active peg-hit dust bursts — 4 short streaks per
                    fresh hit, fanned out from the peg position. */}
                {(() => {
                  const nowTs = Date.now();
                  const bursts: { x: number; y: number; age: number; key: string }[] = [];
                  const collect = (
                    ballId: string,
                    ballRows: number,
                    hits: PegHit[],
                    startedAt: number,
                  ) => {
                    if (ballRows !== rows) return;
                    for (let i = 0; i < hits.length; i++) {
                      const h = hits[i];
                      const age = nowTs - (startedAt + h.ms);
                      if (age < 0 || age > 360) continue;
                      bursts.push({
                        x: h.x * 100,
                        y: TOP_PAD + h.row * ROW_H,
                        age,
                        key: `${ballId}:${i}`,
                      });
                    }
                  };
                  for (const b of balls) collect(b.id, b.rows, b.hits, b.startedAtMs);
                  for (const g of ghosts) collect(g.id, g.rows, g.hits, g.startedAtMs);
                  return bursts.flatMap((burst) => {
                    const t = Math.min(1, burst.age / 360);
                    const dist = 14 + t * 18;
                    const opacity = Math.max(0, 1 - t);
                    return [0, 1, 2, 3].map((dirIdx) => {
                      const angle = (dirIdx / 4) * Math.PI * 2 + (burst.age / 60);
                      const dx = Math.cos(angle) * dist;
                      const dy = Math.sin(angle) * dist;
                      return (
                        <span
                          key={`${burst.key}-${dirIdx}`}
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: `calc(${burst.x}% + ${dx}px)`,
                            top: burst.y + dy,
                            transform: "translate(-50%, -50%)",
                            width: 4,
                            height: 4,
                            borderRadius: 999,
                            background: "#ffe9a8",
                            boxShadow: `0 0 6px rgba(255, 216, 77, ${opacity})`,
                            opacity,
                            pointerEvents: "none",
                          }}
                        />
                      );
                    });
                  });
                })()}

                {/* Player balls — sampled from the physics
                    simulation. We render four faint trailing
                    "after-images" of the ball's recent positions
                    so fast horizontal swings feel weighty, then
                    the live ball on top. */}
                {balls.filter((b) => b.rows === rows).flatMap((b) => {
                  const wallElapsed = Date.now() - b.startedAtMs;
                  const lastHitSimMs = b.hits.length > 0 ? b.hits[b.hits.length - 1].ms : b.totalMs;
                  const elapsed = wallToSim(wallElapsed, { slowMo: b.slowMo, lastHitSimMs });
                  const fieldH = ROW_H * b.rows;
                  const TRAIL_OFFSETS = [60, 45, 30, 16];
                  const trail = TRAIL_OFFSETS.map((back, i) => {
                    const at = elapsed - back;
                    if (at < 0) return null;
                    const tSample = sampleAt(b.samples, at);
                    const opacity = 0.08 + (i / TRAIL_OFFSETS.length) * 0.20;
                    return (
                      <span
                        key={`${b.id}-trail-${i}`}
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: `${tSample.x * 100}%`,
                          top: TOP_PAD + tSample.y * fieldH,
                          transform: "translate(-50%, -50%)",
                          width: 16 - i * 1.5,
                          height: 16 - i * 1.5,
                          borderRadius: 999,
                          background: "var(--gold-300)",
                          opacity,
                          pointerEvents: "none",
                        }}
                      />
                    );
                  });
                  const sample = sampleAt(b.samples, elapsed);
                  const x = sample.x * 100;
                  const y = TOP_PAD + sample.y * fieldH;
                  return [
                    ...trail,
                    <span
                      key={b.id}
                      style={{
                        position: "absolute",
                        left: `${x}%`,
                        top: y,
                        transform: `translate(-50%, -50%) rotate(${sample.rot}deg)`,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "var(--gold-300)",
                        border: "2px solid var(--ink-900)",
                        boxShadow:
                          "inset -2px -3px 0 rgba(26,15,8,0.35), inset 1px 2px 0 rgba(255,255,255,0.55), 0 0 8px rgba(245,200,66,0.55)",
                        willChange: "top, left, transform",
                      }}
                    />,
                  ];
                })}

                {/* Ghost balls — other players' drops, half opacity, no glow */}
                {ghosts.filter((g) => g.rows === rows).map((g) => {
                  const elapsed = Date.now() - g.startedAtMs;
                  const sample = sampleAt(g.samples, elapsed);
                  const x = sample.x * 100;
                  const fieldH = ROW_H * g.rows;
                  const y = TOP_PAD + sample.y * fieldH;
                  return (
                    <span
                      key={g.id}
                      style={{
                        position: "absolute",
                        left: `${x}%`,
                        top: y,
                        transform: `translate(-50%, -50%) rotate(${sample.rot}deg)`,
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: g.avatarColor,
                        border: "2px solid var(--ink-900)",
                        opacity: 0.6,
                        pointerEvents: "none",
                      }}
                      title={g.username}
                    />
                  );
                })}
              </div>

              {/* Buckets — high-mult buckets pulse continuously
                  for anticipation; the bucket the ball lands in
                  flashes gold + spawns an upward dust burst. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${previewTable.length}, 1fr)`,
                  gap: 3,
                  marginTop: 6,
                  position: "relative",
                }}
              >
                {previewTable.map((m, i) => {
                  const flashing = bucketFlashes.some((f) => f.bucket === i);
                  const bigMult = m >= 10;
                  const hugeMult = m >= 50;
                  return (
                    <div
                      key={i}
                      className={
                        bigMult
                          ? hugeMult
                            ? "plinko-bucket-pulse plinko-bucket-pulse-huge"
                            : "plinko-bucket-pulse"
                          : undefined
                      }
                      style={{
                        background: flashing ? "var(--gold-300)" : multiplierColor(m),
                        color: flashing ? "var(--ink-900)" : "var(--parchment-50)",
                        border: flashing ? "3px solid var(--ink-900)" : "2px solid var(--ink-900)",
                        fontFamily: "var(--font-display)",
                        fontSize: 11,
                        textAlign: "center",
                        padding: "5px 2px",
                        textShadow: flashing
                          ? "1px 1px 0 var(--gold-100)"
                          : "1px 1px 0 var(--ink-900)",
                        transform: flashing ? "translateY(-4px)" : "none",
                        transition: "transform 0.18s",
                        boxShadow: flashing ? "var(--glow-gold)" : undefined,
                      }}
                    >
                      ×{m}
                    </div>
                  );
                })}

                {/* Bucket-impact dust — fans 8 sparks upward from
                    the centre of each freshly flashed bucket. */}
                {(() => {
                  const nowTs = Date.now();
                  return bucketFlashes.flatMap((f) => {
                    const age = nowTs - f.at;
                    if (age > 700) return [];
                    const t = age / 700;
                    // x in normalized [0..1] across the buckets row.
                    const cellW = 100 / previewTable.length;
                    const baseX = cellW * (f.bucket + 0.5);
                    const dist = 18 + t * 38;
                    const opacity = Math.max(0, 1 - t * 1.1);
                    return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                      // Fan upward — angle in [-100°, -80° around -90°]...
                      // simpler: even spread over a 200° arc on top.
                      const a = -Math.PI + (i / 7) * Math.PI;
                      const dx = Math.cos(a) * dist;
                      const dy = Math.sin(a) * dist - t * 12;
                      return (
                        <span
                          key={`bdust-${f.bucket}-${f.at}-${i}`}
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: `calc(${baseX}% + ${dx}px)`,
                            top: dy,
                            transform: "translate(-50%, -50%)",
                            width: 4,
                            height: 4,
                            borderRadius: 999,
                            background: "#ffe9a8",
                            boxShadow: `0 0 6px rgba(255, 216, 77, ${opacity})`,
                            opacity,
                            pointerEvents: "none",
                          }}
                        />
                      );
                    });
                  });
                })()}
              </div>
            </div>
          );
        })()}

        {result && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: result.payout > result.payout * 0
                ? (result.payout > bet ? "var(--cactus-500)" : "var(--saddle-300)")
                : "var(--crimson-500)",
            }}
          >
            Bet {bet.toLocaleString()} · ×{result.multiplier} →{" "}
            {result.payout > 0
              ? `${result.payout > bet ? "+" : ""}${(result.payout - bet).toLocaleString()} ¢`
              : `-${bet.toLocaleString()} ¢`}
          </div>
        )}

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Drop Settings</div>
        <div className="stack-lg">
          <div>
            <label className="label">Risk</label>
            <div className="row">
              {RISK_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`btn btn-block ${risk === o.value ? "" : "btn-ghost"}`}
                  onClick={() => setRisk(o.value)}
                  disabled={false}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Rows</label>
            <div className="row">
              {ROW_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn btn-block ${rows === r ? "" : "btn-ghost"}`}
                  onClick={() => setRows(r)}
                  disabled={false}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={false} />

          <button className="btn btn-lg btn-block" onClick={go} disabled={!canDrop}>
            {balls.length > 0 ? `Drop (${balls.length} in air)` : submitting ? "..." : "Drop"}
          </button>
        </div>
      </div>
    </div>
  );
}

function multiplierColor(m: number): string {
  if (m >= 10) return "var(--gold-500)";
  if (m >= 3)  return "var(--crimson-500)";
  if (m >= 1)  return "var(--saddle-300)";
  return "var(--ink-900)";
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    rows_invalid: "Pick 8, 12, or 16 rows.",
    risk_invalid: "Pick low / med / high.",
  };
  return labels[code] ?? "Something went wrong.";
}
