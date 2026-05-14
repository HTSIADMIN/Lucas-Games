"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";
import * as Sfx from "@/lib/sfx";
import {
  ACHIEVEMENTS_BY_ID,
  BANK_PC_PER_WALLET_CENT,
  COINS,
  COIN_ORDER,
  EVENTS,
  EVENT_START_CHANCE_PER_POLL,
  LOST_WALLET_CHANCE_PER_POLL,
  LOST_WALLET_KEEP_MAX_PC,
  LOST_WALLET_KEEP_PC,
  LOST_WALLET_KEEP_WEALTH_PCT,
  LOST_WALLET_LIFETIME_MS,
  MERGE_MIN_AGE_MS,
  AUTO_PICKER_PER_SEC,
  BENT_LUCKY_MS,
  BENT_LUCKY_SHINY_BOOST,
  FROSTED_LIFETIME_BONUS_MS,
  LIGHTNING_RADIUS,
  LUCKY_DURATION_MS,
  LUCKY_SHINY_BOOST,
  BLESSINGS,
  COUCH_CHANCE_PER_POLL,
  COUCH_CUSHIONS,
  COUCH_LIFETIME_MS,
  CURSED_PAUSE_MS,
  FOUNTAIN_CHANCE_PER_POLL,
  FOUNTAIN_LIFETIME_MS,
  FRENZY_BURST_SIZE,
  FRENZY_DURATION_MS,
  FRENZY_SPAWN_MULTIPLIER,
  FRENZY_THRESHOLD,
  STREAK_TIERS,
  STICKY_PICKUP_COUNT,
  STICKY_PICKUP_RADIUS,
  TWO_FINGER_RADIUS,
  type BlessingId,
  type AchievementId,
  type ChestTier,
  type CoinId,
  type CoinTrait,
  type EventId,
  type HelperId,
  type PermUpgradeId,
  type RelicRarity,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import {
  applyAchievementSweep,
  applyBuyBlessing,
  applyBuyPermUpgrade,
  applyBuyMaxUpgrades,
  applyBuyUpgrade,
  applyHireMaxHelpers,
  applyClick,
  applyCushionFlip,
  applyHireHelper,
  applyOfflineAccrual,
  applyOpenChest,
  applyPrestige,
  applyResolveLostWallet,
  bankTokensFromCurrentCents,
  coinPCValue,
  findMergePair,
  freshGameState,
  helperRatePcPerSec,
  migrateLoadedState,
  nextPrestigeThreshold,
  offlineCapHours,
  pruneStreakWindow,
  relicEffects,
  rollSpawn,
  rollTraits,
  spawnIntervalMs,
  streakTierFor,
  unlockedCoins,
  type PennyPinchersGameState,
} from "@/lib/games/penny-pinchers/engine";
import { CoinSprite } from "./CoinSprite";
import { UpgradeShop } from "./UpgradeShop";
import { HelperRoster } from "./HelperRoster";
import { BankTokenShop } from "./BankTokenShop";
import { AchievementsPanel } from "./AchievementsPanel";
import { AlbumPanel } from "./AlbumPanel";
import { FaqModal } from "./FaqModal";
import { RelicShop, type ChestRollResult } from "./RelicShop";
import { PennyLeaderboard } from "./PennyLeaderboard";

// Penny Pinchers — local-first client. The browser owns the entire
// simulation: every action (click, buy, hire, prestige, etc.) is a
// pure mutation against a single PennyPinchersGameState that lives
// in memory. Zero network round-trips during play.
//
// Persistence:
//   • Mount: GET /load — fetches the latest blob from the server
//     (or seeds it from legacy normalized rows on first read), then
//     compares against localStorage and picks whichever is newer.
//   • Every 10s while visible: POST /save — pushes the full state
//     blob to the server if anything has changed since last save.
//   • Tab hide / beforeunload: navigator.sendBeacon to /save so
//     closing the tab never loses progress.
//   • Every mutation: localStorage.setItem mirrors the state, so a
//     failed save POST is recovered on next mount.
//   • Bank: POST /bank with the full state — the only server-
//     authoritative action (credits the wallet ledger atomically
//     with the state save).
//
// Cookie Clicker model with a wallet bridge. No server-side click
// rate limit, no batched-click queue, no optimistic flicker.

/** localStorage key for the mirrored state blob. Versioned so we
 *  can change the shape later without crashing on stale data. */
const LOCAL_STORAGE_KEY = "pp:state:v1";

/** Save cadence + UI countdown. Saves only fire when state is
 *  actually dirty since the last save (no busy traffic for an idle
 *  player). The countdown chip on screen always ticks so the user
 *  knows the autosave is alive. */
const SAVE_INTERVAL_SEC = 10;

type LoadResponse = {
  ok: true;
  state: PennyPinchersGameState;
  lastSavedAt: string | null;
  walletBalance: number;
  serverNow: number;
};

export type LeaderboardRow = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  lifetimePCEarned: number;
  lifetimeClicks: number;
  frugality: number;
  prestigeCount: number;
  walletBalance: number;
  isMe: boolean;
};

type ActiveEvent = { id: EventId; endsAt: number };
type LostWallet = { id: number; x: number; y: number; spawnedAt: number };
type Fountain  = { id: number; x: number; y: number; spawnedAt: number };
type Couch     = { id: number; x: number; y: number; spawnedAt: number };
type ActiveBlessing = { id: BlessingId; endsAt: number };
type CushionReveal = {
  idx: number;
  lootId: string;
  label: string;
  pcGain: number;
  revealedAt: number;
  /** Tier drives the reveal card's colour — looked up from
   *  CUSHION_LOOT on the client so the server response can stay
   *  minimal. */
  tier: "lint" | "low" | "mid" | "high" | "jackpot";
  /** Frugality awarded by the lint pull (0 for everything else). */
  frugalityGained: number;
};
type FloatPop = { id: number; x: number; y: number; pc: number; shiny: boolean };
type ClickBurst = {
  id: number;
  x: number;
  y: number;
  /** Burst flavour — drives particle count, colour, and radius. */
  flavour: "default" | "shiny" | "ancient" | "cursed";
};

/** Brief contracting-ring marker at a coin position. Used to make
 *  Auto-Picker's automated picks visible (so the player sees what
 *  just happened) and to flag a Two-Finger Pickup activation on the
 *  primary + the collateral coin in one frame. */
type GrabRing = {
  id: number;
  x: number;
  y: number;
  kind: "auto" | "twofinger";
};

type SpawnedCoin = {
  id: number;
  /** Original spawn denomination — drives the sprite's base colour. */
  coin: CoinId;
  /** Combined PC value of this coin (post any merges). */
  mergedPC: number;
  /** Every trait the coin is carrying — empty for plain spawns,
   *  multi-entry when independent trait rolls land together or
   *  when two traited coins fuse via Pile It Up. Effects compound
   *  through traitMultiplier on click. */
  traits: CoinTrait[];
  x: number;
  y: number;
  spawnedAt: number;
  /** When set, the coin is sliding toward this point to merge. */
  mergingTo?: { x: number; y: number };
  /** Sticky coins demand two taps. The first tap stamps this so the
   *  sprite plays a skew animation; the second tap actually picks up.
   *  Auto-Picker bypasses this gate (treated as second-tap pickup). */
  firstTapAt?: number;
};

/**
 * Smoothly tweens a numeric `target` whenever it changes — used for
 * the HUD's helper-rate / lifetime-clicks readouts so they count up
 * instead of snapping every state poll. Cancels any in-flight tween
 * on each new target so we don't stack rAF callbacks.
 */
function useTween(target: number, durationMs = 700): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const targetRef = useRef(target);
  useEffect(() => {
    if (target === targetRef.current) return;
    fromRef.current = display;
    targetRef.current = target;
    const start = performance.now();
    const from = fromRef.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);
  return display;
}

const COIN_LIFETIME_MS = 11_000;
/** How long two coins slide toward each other before fusing. */
const MERGE_SLIDE_MS = 280;
/** Leaderboard refresh cadence — separate from save loop, lazy. */
const LEADERBOARD_POLL_MS = 30_000;

export function PennyPinchersClient() {
  // The game state — single source of truth for everything that
  // persists. The /save endpoint stores this exact shape.
  const [state, setState] = useState<PennyPinchersGameState | null>(null);
  /** Mirrored ref so synchronous handlers (clickCoin etc.) can read
   *  the latest state without waiting for React to flush. */
  const stateRef = useRef<PennyPinchersGameState | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  // Save-loop state — drives the countdown chip + status toast.
  const [saveCountdown, setSaveCountdown] = useState<number>(SAVE_INTERVAL_SEC);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  /** Bumped on every state mutation; consumed by the save loop. */
  const dirtyRef = useRef<boolean>(false);

  const [coins, setCoins] = useState<SpawnedCoin[]>([]);
  // Mirror so click handlers can read the live coin list without
  // waiting for React's setState updater (which runs async during
  // the commit phase — breaks Two-Finger collateral PC credit).
  const coinsRef = useRef<SpawnedCoin[]>([]);
  useEffect(() => { coinsRef.current = coins; }, [coins]);
  const [tab, setTab] = useState<"upgrades" | "helpers" | "tokens" | "achievements" | "album" | "relics">("upgrades");
  const [welcomeBack, setWelcomeBack] = useState<number | null>(null);
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  /** When set, shows the celebratory full-screen flash for ~2.5s after a Roll-Up succeeds. */
  const [prestigeCelebration, setPrestigeCelebration] = useState<number | null>(null);
  /** Bumps each manual click so the PC counter can pulse. Helper drips don't bump it. */
  const [pcPulseKey, setPcPulseKey] = useState(0);
  /** Most-recently hired helper id — drives a brief celebratory flash on its row. */
  const [recentlyHiredId, setRecentlyHiredId] = useState<HelperId | null>(null);
  /** Most-recently bought upgrade id — same flash treatment on its card. */
  const [recentlyBoughtUpgradeId, setRecentlyBoughtUpgradeId] = useState<UpgradeId | null>(null);
  /** Most-recently bought perm (token) upgrade id — flash + bump on its card. */
  const [recentlyBoughtPermId, setRecentlyBoughtPermId] = useState<PermUpgradeId | null>(null);
  /** Wallet ¢ payout from the most recent bank — shows the coin-shower for ~1.6s. */
  const [bankCelebration, setBankCelebration] = useState<number | null>(null);
  /** Blessing id mid-celebration — keeps the fountain modal open for ~800ms with a Granted! flash. */
  const [grantedBlessing, setGrantedBlessing] = useState<BlessingId | null>(null);
  const [achievementToasts, setAchievementToasts] = useState<AchievementId[]>([]);
  /** Transient error toast for failed upgrade purchases — surfaces
   *  any "took my money but didn't level" failures the new atomic
   *  pp_buy_upgrade RPC was meant to eliminate. */
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [lostWallet, setLostWallet] = useState<LostWallet | null>(null);
  const [walletModalChoice, setWalletModalChoice] = useState<null | "open" | "submitting">(null);
  const [pops, setPops] = useState<FloatPop[]>([]);
  const [bursts, setBursts] = useState<ClickBurst[]>([]);
  const burstSeqRef = useRef(0);
  const [grabs, setGrabs] = useState<GrabRing[]>([]);
  const grabSeqRef = useRef(0);
  const [fountain, setFountain] = useState<Fountain | null>(null);
  const [couch, setCouch] = useState<Couch | null>(null);
  const [fountainModalOpen, setFountainModalOpen] = useState(false);
  const [couchModalOpen, setCouchModalOpen] = useState(false);
  const [cushionReveals, setCushionReveals] = useState<CushionReveal[]>([]);
  const [activeBlessings, setActiveBlessings] = useState<ActiveBlessing[]>([]);
  const streakClicksRef = useRef<number[]>([]);
  const [streakCount, setStreakCount] = useState(0);
  const [frenzyEndsAt, setFrenzyEndsAt] = useState<number | null>(null);
  /** Bent's lucky-window timer — boosts shiny chance for BENT_LUCKY_MS. */
  const [bentLuckyUntil, setBentLuckyUntil] = useState<number | null>(null);
  /** Lucky's bigger lucky-window — bigger boost, longer window than Bent. */
  const [luckyBoostUntil, setLuckyBoostUntil] = useState<number | null>(null);
  /** When true, the Auto-Picker upgrade's tick loop is suspended.
   *  Lets the player stop the auto-clicks during a Pile-It-Up run
   *  so big merges aren't poached by a stray auto-grab. */
  const [autoPickerPaused, setAutoPickerPaused] = useState(false);
  /** Cursed's spawn-pause timer — pauses spawns for CURSED_PAUSE_MS. */
  const [cursedPauseUntil, setCursedPauseUntil] = useState<number | null>(null);
  const popSeqRef = useRef(0);
  const lostWalletSeqRef = useRef(0);
  const fountainSeqRef = useRef(0);
  const couchSeqRef = useRef(0);

  const spawnPop = useCallback((
    x: number,
    y: number,
    pc: number,
    shiny: boolean,
    trait: CoinTrait | null = null,
  ) => {
    popSeqRef.current += 1;
    const id = popSeqRef.current;
    setPops((prev) => [...prev, { id, x, y, pc, shiny }]);
    window.setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== id));
    }, 800);
    // Click burst — radial particle ring at the pickup point.
    // Rare traits get a beefier burst flavour: more particles,
    // bigger radius, distinct colour. Plain pickups stay light.
    const flavour: ClickBurst["flavour"] =
      trait === "ancient" ? "ancient"
      : trait === "shiny"  ? "shiny"
      : trait === "cursed" ? "cursed"
      : "default";
    burstSeqRef.current += 1;
    const burstId = burstSeqRef.current;
    setBursts((prev) => [...prev, { id: burstId, x, y, flavour }]);
    // Ancient burst lingers a bit longer because it's the rarest.
    const lifeMs = flavour === "ancient" ? 720 : flavour === "default" ? 480 : 600;
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burstId));
    }, lifeMs);
  }, []);

  /** Spawn a brief contracting-ring marker at the given coords.
   *  "auto" is the green Auto-Picker pinch; "twofinger" is the cyan
   *  Two-Finger Pickup ring (we drop one on each end of the catch). */
  const spawnGrab = useCallback((x: number, y: number, kind: GrabRing["kind"]) => {
    grabSeqRef.current += 1;
    const id = grabSeqRef.current;
    setGrabs((prev) => [...prev, { id, x, y, kind }]);
    window.setTimeout(() => {
      setGrabs((prev) => prev.filter((g) => g.id !== id));
    }, 480);
  }, []);
  const playRef = useRef<HTMLDivElement | null>(null);
  const coinSeqRef = useRef(0);

  // ----------------------------------------------------------------
  // PERSISTENCE — load on mount, save every 10s + on hide / unload
  // ----------------------------------------------------------------

  /** Write current state to localStorage. Synchronous, fail-safe —
   *  caller doesn't have to await. Mirrored on every save attempt
   *  so a failed POST is recovered on the next mount. */
  const mirrorLocal = useCallback((s: PennyPinchersGameState) => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ state: s, savedAt: Date.now() }),
      );
    } catch { /* quota / SecurityError — skip */ }
  }, []);

  /** POST the current state to /save. When `useBeacon=true` we send
   *  via navigator.sendBeacon so a tab-close fires-and-forgets the
   *  packet (regular fetch is aborted by the browser on unload). */
  const saveNow = useCallback((useBeacon = false): boolean => {
    const s = stateRef.current;
    if (!s) return false;
    mirrorLocal(s);
    const body = JSON.stringify({ state: s });
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        "/api/earn/penny-pinchers/save",
        new Blob([body], { type: "application/json" }),
      );
      if (ok) dirtyRef.current = false;
      return ok;
    }
    setSaveStatus("saving");
    void fetch("/api/earn/penny-pinchers/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    })
      .then((r) => {
        if (r.ok) {
          dirtyRef.current = false;
          setSaveStatus("saved");
          setLastSavedAt(new Date().toISOString());
          // Drop the "Saved" pulse after a moment so the chip
          // returns to plain ticking countdown.
          window.setTimeout(() => {
            setSaveStatus((cur) => (cur === "saved" ? "idle" : cur));
          }, 1500);
        } else {
          setSaveStatus("failed");
        }
      })
      .catch(() => setSaveStatus("failed"));
    return true;
  }, [mirrorLocal]);

  // Load on mount. Picks the newer of (server blob, localStorage
  // mirror) — phone → laptop sync wants the freshest write to win.
  // Applies offline helper accrual and shows the welcome-back banner.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let serverState: PennyPinchersGameState | null = null;
      let serverSavedAtMs = 0;
      let serverWallet = 0;
      try {
        const r = await fetch("/api/earn/penny-pinchers/load");
        if (r.ok) {
          const d = (await r.json()) as LoadResponse;
          serverState = migrateLoadedState(d.state);
          serverSavedAtMs = d.lastSavedAt ? new Date(d.lastSavedAt).getTime() : 0;
          serverWallet = d.walletBalance;
          if (!cancelled) setLastSavedAt(d.lastSavedAt);
        }
      } catch { /* offline — fall back to local */ }

      let localState: PennyPinchersGameState | null = null;
      let localSavedAtMs = 0;
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { state: unknown; savedAt: number };
          localState = migrateLoadedState(parsed.state);
          localSavedAtMs = parsed.savedAt;
        }
      } catch { /* malformed local; ignore */ }

      // Pick the most-recent save. If the local mirror is newer than
      // the server (player banked progress, closed tab before save
      // completed, then re-opened), local wins.
      let chosen: PennyPinchersGameState;
      if (localState && localSavedAtMs > serverSavedAtMs) chosen = localState;
      else if (serverState) chosen = serverState;
      else if (localState) chosen = localState;
      else chosen = freshGameState();

      // Apply offline helper accrual once we've picked the winning
      // save. Welcome-back banner only fires on the very first load
      // AND only when the player has been away for ≥ 60s of real
      // wall-clock time — otherwise every page open would pop the
      // banner with a fractional accrual.
      const { state: accrued, accrued: pcGained } = applyOfflineAccrual(chosen);
      if (cancelled) return;
      stateRef.current = accrued;
      setState(accrued);
      setWalletBalance(serverWallet);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        const gapMs = chosen.lastTickAt ? Date.now() - chosen.lastTickAt : 0;
        if (pcGained > 0 && gapMs >= 60_000) {
          setWelcomeBack(pcGained);
          window.setTimeout(() => setWelcomeBack(null), 6000);
        }
      }
      // If we just credited offline accrual, persist immediately so
      // a refresh doesn't double-credit by re-reading the same
      // stale lastTickAt.
      if (pcGained > 0) {
        dirtyRef.current = true;
        // Don't block UI on this — save loop will pick it up next
        // tick if it doesn't land synchronously.
        saveNow(false);
      }
    })();
    return () => { cancelled = true; };
  }, [saveNow]);

  // Save loop — countdown chip ticks every second; when it hits 0
  // and the state is dirty, fire a save and reset. Paused on hidden
  // tabs via useVisibleInterval so a stale background tab doesn't
  // hammer the server.
  useVisibleInterval(useCallback(() => {
    setSaveCountdown((c) => {
      if (c <= 1) {
        if (dirtyRef.current) saveNow();
        return SAVE_INTERVAL_SEC;
      }
      return c - 1;
    });
  }, [saveNow]), 1000);

  // Tab-hide / before-unload — flush any pending dirty state via
  // sendBeacon so a navigation away doesn't lose progress.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && dirtyRef.current) saveNow(true);
    };
    const onUnload = () => {
      if (dirtyRef.current) saveNow(true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [saveNow]);

  // ----------------------------------------------------------------
  // STATE MUTATION HELPER + DERIVED `server` SHAPE
  // ----------------------------------------------------------------

  /** Run a pure mutation on the live state. Bumps dirty flag,
   *  sweeps achievements, fires unlock toasts. Returns the resulting
   *  state so the caller can use derived values (e.g. cents delta
   *  for a pop animation). */
  const mutate = useCallback(
    (mutator: (cur: PennyPinchersGameState) => PennyPinchersGameState | null): PennyPinchersGameState | null => {
      const cur = stateRef.current;
      if (!cur) return null;
      const after = mutator(cur);
      if (!after) return null;
      const { state: swept, newlyUnlocked } = applyAchievementSweep(after);
      stateRef.current = swept;
      setState(swept);
      dirtyRef.current = true;
      if (newlyUnlocked.length > 0) {
        Sfx.play("win.levelup");
        setAchievementToasts((prev) => [...prev, ...newlyUnlocked]);
        window.setTimeout(() => {
          setAchievementToasts((prev) => prev.filter((id) => !newlyUnlocked.includes(id)));
        }, 6000);
      }
      return swept;
    },
    [],
  );

  /** Current PC in pocket — read by JSX + every spend handler. All
   *  cents mutations go through `mutate(applyXxx)`; this alias is
   *  read-only. */
  const localCents = state?.cents ?? 0;

  // Memoised `server`-shaped view of the state. Keeps the JSX
  // reading `server.upgrades` / `server.prestige.thresholdPC` /
  // `server.relicEffects.*` unchanged.
  const server = useMemo(() => {
    if (!state) return null;
    const relicE = relicEffects(state.relics);
    return {
      cents: state.cents,
      lifetimeClicks: state.lifetimeClicks,
      lifetimePCEarned: state.lifetimePCEarned,
      upgrades: state.upgrades as Record<UpgradeId, number>,
      helpers: state.helpers as Record<HelperId, number>,
      perm: state.perm,
      helperRatePerSec: helperRatePcPerSec(state.helpers, state.perm, relicE),
      offlineCapHours: offlineCapHours(state.perm),
      bank: { pcPerWalletCent: BANK_PC_PER_WALLET_CENT },
      prestige: {
        count: state.prestigeCount,
        bankTokens: state.bankTokens,
        thresholdPC: nextPrestigeThreshold(state.prestigeCount),
        tokensIfRolled: bankTokensFromCurrentCents(state.cents, state.prestigeCount),
        lifetimeBanked: state.lifetimeBankedCents,
      },
      achievements: { unlocked: state.achievementsUnlocked },
      frugality: state.frugality,
      album: state.album,
      relics: state.relics as Record<string, number>,
      relicEffects: relicE,
      walletBalance,
      leaderboard,
    };
  }, [state, walletBalance, leaderboard]);

  // Pull the public Penny Pinchers leaderboard on a slow cadence —
  // not part of the critical state path. Paused on hidden tabs.
  const loadLeaderboard = useCallback(async () => {
    try {
      const r = await fetch("/api/earn/penny-pinchers/leaderboard");
      if (!r.ok) return;
      const d = (await r.json()) as { ok: boolean; rows: LeaderboardRow[] };
      if (d.ok) setLeaderboard(d.rows);
    } catch { /* non-fatal */ }
  }, []);
  useVisibleInterval(loadLeaderboard, LEADERBOARD_POLL_MS);
  useEffect(() => { void loadLeaderboard(); }, [loadLeaderboard]);

  // Random event rolls — unchanged from the old /state-poll cadence,
  // just driven by a local interval now. Coin Storm / Rainy Day,
  // wishing fountain, couch dive, lost wallet all roll here.
  useVisibleInterval(useCallback(() => {
    const nowMs = Date.now();
    setActiveEvent((current) => {
      if (current && current.endsAt > nowMs) return current;
      const stormBonus = stateRef.current ? relicEffects(stateRef.current.relics).stormChanceBonus : 0;
      if (Math.random() < EVENT_START_CHANCE_PER_POLL + stormBonus) {
        const ids = Object.keys(EVENTS) as EventId[];
        const id: EventId =
          stormBonus > 0 && Math.random() < 0.5 + stormBonus * 5
            ? "coin_storm"
            : ids[Math.floor(Math.random() * ids.length)];
        const def = EVENTS[id];
        Sfx.play(id === "coin_storm" ? "win.levelup" : "coins.clink");
        return { id, endsAt: nowMs + def.durationMs };
      }
      return null;
    });
    setActiveBlessings((bs) => bs.filter((b) => b.endsAt > nowMs));
    setFountain((current) => {
      if (current && nowMs - current.spawnedAt < FOUNTAIN_LIFETIME_MS) return current;
      if (Math.random() < FOUNTAIN_CHANCE_PER_POLL) {
        const playEl = playRef.current;
        if (!playEl) return null;
        const rect = playEl.getBoundingClientRect();
        const pad = 70;
        fountainSeqRef.current += 1;
        return {
          id: fountainSeqRef.current,
          x: pad + Math.random() * Math.max(0, rect.width - pad * 2),
          y: pad + Math.random() * Math.max(0, rect.height - pad * 2),
          spawnedAt: nowMs,
        };
      }
      return null;
    });
    setCouch((current) => {
      if (current && nowMs - current.spawnedAt < COUCH_LIFETIME_MS) return current;
      if (Math.random() < COUCH_CHANCE_PER_POLL) {
        const playEl = playRef.current;
        if (!playEl) return null;
        const rect = playEl.getBoundingClientRect();
        const pad = 80;
        couchSeqRef.current += 1;
        return {
          id: couchSeqRef.current,
          x: pad + Math.random() * Math.max(0, rect.width - pad * 2),
          y: pad + Math.random() * Math.max(0, rect.height - pad * 2),
          spawnedAt: nowMs,
        };
      }
      return null;
    });
    setLostWallet((current) => {
      if (current && nowMs - current.spawnedAt < LOST_WALLET_LIFETIME_MS) return current;
      if (Math.random() < LOST_WALLET_CHANCE_PER_POLL) {
        const playEl = playRef.current;
        if (!playEl) return null;
        const rect = playEl.getBoundingClientRect();
        const pad = 60;
        lostWalletSeqRef.current += 1;
        return {
          id: lostWalletSeqRef.current,
          x: pad + Math.random() * Math.max(0, rect.width - pad * 2),
          y: pad + Math.random() * Math.max(0, rect.height - pad * 2),
          spawnedAt: nowMs,
        };
      }
      return null;
    });
  }, []), 6_000);

  // Helper PC accrual — drip cents into local state every 100ms
  // so the counter visibly ticks. Each tick bumps lifetimePCEarned
  // + lastTickAt too (used by the offline-accrual math on next load).
  const helperRate = server?.helperRatePerSec ?? 0;
  useEffect(() => {
    if (helperRate <= 0) return;
    const tickMs = 100;
    const perTick = (helperRate * tickMs) / 1000;
    const t = window.setInterval(() => {
      const cur = stateRef.current;
      if (!cur) return;
      const next: PennyPinchersGameState = {
        ...cur,
        cents: cur.cents + perTick,
        lifetimePCEarned: cur.lifetimePCEarned + perTick,
        lastTickAt: Date.now(),
      };
      stateRef.current = next;
      setState(next);
      dirtyRef.current = true;
    }, tickMs);
    return () => window.clearInterval(t);
  }, [helperRate]);

  // Coin spawner — applies the active event's spawn-rate multiplier
  // and bonus shiny chance so Coin Storm rains coins and Rainy Day
  // glints with shinies. Wishing Fountain blessings stack on top.
  const upgrades = (server?.upgrades ?? {}) as Record<UpgradeId, number>;
  const baseIntervalMs = useMemo(() => spawnIntervalMs(upgrades), [upgrades]);
  const eventDef = activeEvent ? EVENTS[activeEvent.id] : null;
  const hasSharpEyes = activeBlessings.some((b) => b.id === "sharp_eyes");
  const hasLucky = activeBlessings.some((b) => b.id === "lucky_streak");
  const hasGreedy = activeBlessings.some((b) => b.id === "greedy_spawns");
  const frenzyActive = frenzyEndsAt != null && frenzyEndsAt > Date.now();
  const bentLucky = bentLuckyUntil != null && bentLuckyUntil > Date.now();
  const luckyBoost = luckyBoostUntil != null && luckyBoostUntil > Date.now();
  const eventInterval = eventDef ? baseIntervalMs * eventDef.spawnMultiplier : baseIntervalMs;
  const intervalMs = Math.max(
    100,
    Math.round(
      eventInterval *
        (hasSharpEyes ? 0.5 : 1) *
        (frenzyActive ? FRENZY_SPAWN_MULTIPLIER : 1) *
        (server?.relicEffects.spawnSpeedMul ?? 1),
    ),
  );
  const burstSize =
    ((eventDef?.extraConcurrent ?? 0) > 0 ? 1 + eventDef!.extraConcurrent : 1) +
    (frenzyActive ? FRENZY_BURST_SIZE : 0);
  const bonusShiny =
    (eventDef?.bonusShinyChance ?? 0) +
    (hasLucky ? 0.1 : 0) +
    (bentLucky ? BENT_LUCKY_SHINY_BOOST : 0) +
    (luckyBoost ? LUCKY_SHINY_BOOST : 0);
  // Coin spawner — fully ref-driven, self-scheduling. The effect
  // mounts ONCE per game session (deps: just [isLoaded]) and runs a
  // setTimeout chain that re-reads its parameters from a ref before
  // each spawn. This makes the spawn cadence completely independent
  // of React state churn — helper drips (every 100 ms), saves
  // (every 10 s), event polls, etc. no longer tear down + restart
  // the interval, which was causing "spawn fast → pause → spawn
  // fast → pause" bursts synced with the autosave timer.
  const isLoaded = state != null;
  const spawnInputsRef = useRef({
    intervalMs,
    upgrades,
    burstSize,
    bonusShiny,
    hasGreedy,
    cursedPauseUntil,
  });
  useEffect(() => {
    spawnInputsRef.current = {
      intervalMs,
      upgrades,
      burstSize,
      bonusShiny,
      hasGreedy,
      cursedPauseUntil,
    };
  });
  useEffect(() => {
    if (!isLoaded) return;
    let tid: number | null = null;
    let cancelled = false;
    const schedule = (delay: number) => {
      tid = window.setTimeout(() => {
        if (cancelled) return;
        const params = spawnInputsRef.current;
        const cur = stateRef.current;
        const playEl = playRef.current;
        // Cursed pause: don't spawn, but keep the chain alive.
        if (
          params.cursedPauseUntil != null &&
          params.cursedPauseUntil > Date.now()
        ) {
          schedule(params.intervalMs);
          return;
        }
        if (!cur || !playEl) {
          schedule(params.intervalMs);
          return;
        }
        const rect = playEl.getBoundingClientRect();
        const pad = 40;
        const newSpawns: SpawnedCoin[] = [];
        const baseCount = params.burstSize;
        const extraHandsLevel = params.upgrades.extra_hands ?? 0;
        let total = baseCount;
        for (let k = 0; k < baseCount; k++) {
          if (Math.random() < Math.min(0.5, 0.05 * extraHandsLevel)) total++;
        }
        const curRelicE = relicEffects(cur.relics);
        for (let i = 0; i < total; i++) {
          const x = pad + Math.random() * Math.max(0, rect.width - pad * 2);
          const y = pad + Math.random() * Math.max(0, rect.height - pad * 2);
          let coin = rollSpawn(params.upgrades);
          if (params.hasGreedy && Math.random() < 0.5) {
            const list = unlockedCoins(params.upgrades);
            coin = list[list.length - 1];
          }
          const traits = rollTraits(coin, params.upgrades, cur.perm, cur.album);
          if (
            !traits.includes("shiny") &&
            params.bonusShiny > 0 &&
            Math.random() < params.bonusShiny
          ) {
            traits.push("shiny");
          }
          coinSeqRef.current += 1;
          const mergedPC = coinPCValue(coin, params.upgrades, cur.perm, curRelicE);
          newSpawns.push({
            id: coinSeqRef.current,
            coin,
            mergedPC,
            traits,
            x,
            y,
            spawnedAt: Date.now(),
          });
        }
        setCoins((prev) => [...prev, ...newSpawns]);
        schedule(params.intervalMs);
      }, delay);
    };
    schedule(spawnInputsRef.current.intervalMs);
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
    };
  }, [isLoaded]);

  // Auto-Picker — also self-scheduling so a level / pause flip
  // doesn't restart the timer in a way that delays the next pick.
  const clickCoinRef = useRef<typeof clickCoin>(clickCoin);
  clickCoinRef.current = clickCoin;
  const autoPickerLevel = upgrades.auto_picker ?? 0;
  const autoPickerRef = useRef({ level: autoPickerLevel, paused: autoPickerPaused });
  useEffect(() => {
    autoPickerRef.current = { level: autoPickerLevel, paused: autoPickerPaused };
  });
  useEffect(() => {
    if (!isLoaded) return;
    let tid: number | null = null;
    let cancelled = false;
    const schedule = (delay: number) => {
      tid = window.setTimeout(() => {
        if (cancelled) return;
        const { level, paused } = autoPickerRef.current;
        if (level <= 0 || paused) {
          // Re-check at the base cadence — when the player flips
          // the toggle back on, we'll resume within ~500ms.
          schedule(500);
          return;
        }
        let target: SpawnedCoin | null = null;
        setCoins((prev) => {
          if (prev.length > 0) target = prev[Math.floor(Math.random() * prev.length)];
          return prev;
        });
        if (target) {
          const t2 = target as SpawnedCoin;
          spawnGrab(t2.x, t2.y, "auto");
          void clickCoinRef.current(t2, { silent: true });
        }
        const pickIntervalMs = Math.max(150, Math.floor(1000 / (AUTO_PICKER_PER_SEC * level)));
        schedule(pickIntervalMs);
      }, delay);
    };
    schedule(500);
    return () => {
      cancelled = true;
      if (tid != null) window.clearTimeout(tid);
    };
  }, [isLoaded, spawnGrab]);

  // Merge proximity loop — only runs when "pile_it_up" is owned.
  // Any two coins within MERGE_PROXIMITY_PX fuse into a single
  // coin whose PC value is the sum. We mark both as `mergingTo`
  // the centroid first; CSS transitions slide them together over
  // mergeSlideMs (driven by the Merging Hands relic, default
  // MERGE_SLIDE_MS = 280ms), then a setTimeout swaps them for the
  // fused coin. Watching pennies physically pull toward each
  // other before fusing reads way better than them just blinking
  // out.
  const mergeSpeedMul = server?.relicEffects.mergeSpeedMul ?? 1;
  const mergeSlideMs = Math.max(80, Math.round(MERGE_SLIDE_MS * mergeSpeedMul));
  const mergeMinAgeMs = Math.max(200, Math.round(MERGE_MIN_AGE_MS * mergeSpeedMul));
  useEffect(() => {
    if (!isLoaded) return;
    if ((upgrades.pile_it_up ?? 0) < 1) return;
    const t = window.setInterval(() => {
      setCoins((prev) => {
        const eligibleCutoff = Date.now() - mergeMinAgeMs;
        const eligible = prev
          // Skip already-merging coins so a pair can't get re-recruited mid-slide.
          .filter((c) => c.spawnedAt <= eligibleCutoff && !c.mergingTo)
          .map((c) => ({ id: c.id, pc: c.mergedPC, x: c.x, y: c.y, spawnedAt: c.spawnedAt }));
        const pair = findMergePair(eligible);
        if (!pair) return prev;
        const [aId, bId] = pair.ids;
        const a = prev.find((c) => c.id === aId);
        const b = prev.find((c) => c.id === bId);
        if (!a || !b) return prev;
        const fusionId = ++coinSeqRef.current;
        // Schedule the actual fusion after the slide completes.
        // We re-read state at fuse time in case the player clicked
        // one mid-slide — only fuse if both halves are still here.
        window.setTimeout(() => {
          setCoins((cur) => {
            const ax = cur.find((c) => c.id === aId);
            const bx = cur.find((c) => c.id === bId);
            if (!ax || !bx) return cur.filter((c) => c.id !== aId && c.id !== bId);
            const baseCoin = ax.mergedPC >= bx.mergedPC ? ax.coin : bx.coin;
            // Merged coin inherits BOTH parents' traits — a shiny
            // and a cursed fusing become a shiny+cursed coin whose
            // click compounds 5× × 3× = 15× on the summed value.
            // De-duplicated so two of the same trait don't double up.
            const seen = new Set<string>();
            const traits: CoinTrait[] = [];
            for (const t of [...ax.traits, ...bx.traits]) {
              if (seen.has(t)) continue;
              seen.add(t);
              traits.push(t);
            }
            return [
              ...cur.filter((c) => c.id !== aId && c.id !== bId),
              {
                id: fusionId,
                coin: baseCoin,
                mergedPC: ax.mergedPC + bx.mergedPC,
                traits,
                x: pair.centroid.x,
                y: pair.centroid.y,
                spawnedAt: Date.now(),
              },
            ];
          });
        }, mergeSlideMs);
        return prev.map((c) =>
          c.id === aId || c.id === bId
            ? { ...c, mergingTo: pair.centroid }
            : c,
        );
      });
    }, 350);
    return () => window.clearInterval(t);
  }, [isLoaded, upgrades.pile_it_up, mergeSlideMs, mergeMinAgeMs]);

  // Streak-window pruner — trims expired clicks + clears
  // expired client-side timers (Frenzy, Bent's lucky window,
  // Cursed's spawn pause). Drives meters shrinking even when
  // the player isn't clicking.
  useEffect(() => {
    const t = window.setInterval(() => {
      const nowMs = Date.now();
      streakClicksRef.current = pruneStreakWindow(streakClicksRef.current, nowMs);
      setStreakCount(streakClicksRef.current.length);
      setFrenzyEndsAt((cur) => (cur != null && cur < nowMs ? null : cur));
      setBentLuckyUntil((cur) => (cur != null && cur < nowMs ? null : cur));
      setCursedPauseUntil((cur) => (cur != null && cur < nowMs ? null : cur));
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  // Coin reaper — drop coins that have aged out
  useEffect(() => {
    const t = window.setInterval(() => {
      const cutoff = Date.now() - COIN_LIFETIME_MS;
      setCoins((prev) => prev.filter((c) => c.spawnedAt > cutoff));
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  function clickCoin(coin: SpawnedCoin, opts: { silent?: boolean } = {}) {
    // Sticky two-tap gate — first tap stamps `firstTapAt`, second
    // tap actually picks up. Auto-Picker (silent=true) bypasses it.
    if (coin.traits.includes("sticky") && !coin.firstTapAt && !opts.silent) {
      Sfx.play("ui.wood");
      const stampedAt = Date.now();
      setCoins((prev) =>
        prev.map((c) => (c.id === coin.id ? { ...c, firstTapAt: stampedAt } : c)),
      );
      return;
    }

    if (!opts.silent) Sfx.play("ui.wood");

    // Pinch Streak window — record click, ignite Frenzy if we cross
    // the top tier.
    const nowClick = Date.now();
    const win = pruneStreakWindow([...streakClicksRef.current, nowClick], nowClick);
    streakClicksRef.current = win;
    setStreakCount(win.length);
    const tier = streakTierFor(win, nowClick);
    if (tier.threshold >= FRENZY_THRESHOLD && (frenzyEndsAt == null || frenzyEndsAt < nowClick)) {
      Sfx.play("coins.shower");
      setFrenzyEndsAt(nowClick + FRENZY_DURATION_MS);
    }

    // Trait-driven client buffs/penalties.
    if (coin.traits.includes("bent")) setBentLuckyUntil(Date.now() + BENT_LUCKY_MS);
    if (coin.traits.includes("cursed")) setCursedPauseUntil(Date.now() + CURSED_PAUSE_MS);
    if (coin.traits.includes("lucky")) setLuckyBoostUntil(Date.now() + LUCKY_DURATION_MS);

    // Streak-adjusted merged PC — pass to applyClick which folds in
    // trait, frugality, album, prestige, and relic multipliers.
    const streakAdjustedPC = Math.round(coin.mergedPC * tier.multiplier);
    const cur = stateRef.current;
    if (!cur) return;
    const afterPrimary = applyClick(cur, {
      coinType: coin.coin,
      traits: coin.traits,
      mergedPC: streakAdjustedPC,
    });
    const primaryGained = afterPrimary.cents - cur.cents;
    spawnPop(coin.x, coin.y, primaryGained, coin.traits.includes("shiny"), coin.traits[0] ?? null);
    setPcPulseKey((k) => k + 1);

    // Collateral pickups — Sticky / Two-Finger / Lightning all
    // share the same shape. We compute the list SYNCHRONOUSLY from
    // `coinsRef.current` (NOT from inside setCoins, whose updater
    // runs async during React's commit — which was silently
    // dropping Two-Finger PC credits because the for-loop below
    // executed before the updater populated `collateral`).
    const live = coinsRef.current;
    const others = live.filter((c) => c.id !== coin.id);
    const collateral: SpawnedCoin[] = [];
    let twoFingerExtra: SpawnedCoin | null = null;

    if (coin.traits.includes("sticky")) {
      const nearby = others
        .map((c) => ({ c, d2: (c.x - coin.x) ** 2 + (c.y - coin.y) ** 2 }))
        .filter((e) => e.d2 <= STICKY_PICKUP_RADIUS * STICKY_PICKUP_RADIUS)
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, STICKY_PICKUP_COUNT)
        .map((e) => e.c);
      collateral.push(...nearby);
    }

    const tfLevel = (afterPrimary.upgrades.two_finger_pickup ?? 0);
    if (tfLevel > 0) {
      const chance = Math.min(0.5, 0.05 * tfLevel);
      if (Math.random() < chance) {
        const taken = new Set(collateral.map((c) => c.id));
        const extra = others
          .filter((c) => !taken.has(c.id))
          .map((c) => ({ c, d2: (c.x - coin.x) ** 2 + (c.y - coin.y) ** 2 }))
          .filter((e) => e.d2 <= TWO_FINGER_RADIUS * TWO_FINGER_RADIUS)
          .sort((a, b) => a.d2 - b.d2)[0];
        if (extra) {
          collateral.push(extra.c);
          twoFingerExtra = extra.c;
        }
      }
    }

    if (coin.traits.includes("lightning")) {
      const taken = new Set(collateral.map((c) => c.id));
      const arc = others
        .filter((c) => !taken.has(c.id))
        .map((c) => ({ c, d2: (c.x - coin.x) ** 2 + (c.y - coin.y) ** 2 }))
        .filter((e) => e.d2 <= LIGHTNING_RADIUS * LIGHTNING_RADIUS)
        .sort((a, b) => a.d2 - b.d2)[0];
      if (arc) {
        collateral.push(arc.c);
        if (!twoFingerExtra) twoFingerExtra = arc.c;
      }
    }

    // Removal happens once — synchronous, deterministic, based on
    // the collateral list we just built.
    if (collateral.length > 0 || coin.id != null) {
      const removeIds = new Set([coin.id, ...collateral.map((c) => c.id)]);
      setCoins((prev) => prev.filter((c) => !removeIds.has(c.id)));
    }

    if (twoFingerExtra) {
      spawnGrab(coin.x, coin.y, "twofinger");
      spawnGrab(twoFingerExtra.x, twoFingerExtra.y, "twofinger");
    }

    // Apply every collateral pickup through the engine — credits PC,
    // bumps lifetime counters, increments album. One final mutate
    // commits the lot so achievements only sweep once.
    let working = afterPrimary;
    for (const extra of collateral) {
      const extraAdj = Math.round(extra.mergedPC * tier.multiplier);
      const next = applyClick(working, {
        coinType: extra.coin,
        traits: extra.traits,
        mergedPC: extraAdj,
      });
      const extraGained = next.cents - working.cents;
      spawnPop(extra.x, extra.y, extraGained, extra.traits.includes("shiny"), extra.traits[0] ?? null);
      working = next;
    }
    // Extra pickup chime — a quick clink for each collateral coin so
    // the player can HEAR the chain-grab landing on top of the base
    // wood click that fired for the primary. Throttle on the SFX
    // registry keeps a 5-coin sticky sweep from machine-gunning.
    if (collateral.length > 0 && !opts.silent) {
      Sfx.play("coins.clink");
    }

    mutate(() => working);
  }

  function buyUpgrade(id: UpgradeId, cost: number) {
    void cost; // cost is recomputed inside applyBuyUpgrade
    const cur = stateRef.current;
    if (!cur) return;
    const result = applyBuyUpgrade(cur, id);
    if (!result.ok) {
      const msg = labelForUpgradeError(result.error);
      setUpgradeError(msg);
      window.setTimeout(() => setUpgradeError((c) => (c === msg ? null : c)), 4000);
      return;
    }
    mutate(() => result.state);
    setRecentlyBoughtUpgradeId(id);
    window.setTimeout(() => {
      setRecentlyBoughtUpgradeId((c) => (c === id ? null : c));
    }, 700);
    Sfx.play("ui.click");
  }

  /** Greedy max-buy on the Upgrades tab. Runs the engine helper once
   *  (single state mutation, single render, single save-dirty mark)
   *  and returns the summary so the shop can flash a "Bought N for X
   *  PC" toast. */
  function buyMaxUpgrades(): { bought: number; spent: number } | null {
    const cur = stateRef.current;
    if (!cur) return null;
    const result = applyBuyMaxUpgrades(cur);
    if (result.bought <= 0) return null;
    mutate(() => result.state);
    Sfx.play("chips.stack");
    return { bought: result.bought, spent: result.spent };
  }

  function hireHelper(id: HelperId, cost: number) {
    void cost;
    const cur = stateRef.current;
    if (!cur) return;
    const result = applyHireHelper(cur, id);
    if (!result.ok) return;
    mutate(() => result.state);
    setRecentlyHiredId(id);
    window.setTimeout(() => {
      setRecentlyHiredId((c) => (c === id ? null : c));
    }, 700);
    Sfx.play("chips.handle");
  }

  /** Greedy max-hire on the Helpers tab — same shape as buyMaxUpgrades. */
  function hireMaxHelpers(): { hired: number; spent: number } | null {
    const cur = stateRef.current;
    if (!cur) return null;
    const result = applyHireMaxHelpers(cur);
    if (result.hired <= 0) return null;
    mutate(() => result.state);
    Sfx.play("chips.handle");
    return { hired: result.hired, spent: result.spent };
  }

  function buyPermUpgrade(id: PermUpgradeId, cost: number) {
    void cost;
    const cur = stateRef.current;
    if (!cur) return;
    const result = applyBuyPermUpgrade(cur, id);
    if (!result.ok) return;
    mutate(() => result.state);
    setRecentlyBoughtPermId(id);
    window.setTimeout(() => {
      setRecentlyBoughtPermId((c) => (c === id ? null : c));
    }, 700);
    Sfx.play("ui.click");
  }

  function buyBlessing(id: BlessingId) {
    const def = BLESSINGS[id];
    if (!def) return;
    const cur = stateRef.current;
    if (!cur) return;
    const result = applyBuyBlessing(cur, id);
    if (!result.ok) return;
    mutate(() => result.state);
    if (def.durationMs > 0) {
      setActiveBlessings((bs) => [...bs, { id, endsAt: Date.now() + def.durationMs }]);
    }
    setGrantedBlessing(id);
    Sfx.play(def.durationMs > 0 ? "win.levelup" : "coins.handle");
    window.setTimeout(() => {
      setGrantedBlessing(null);
      setFountain(null);
      setFountainModalOpen(false);
    }, 850);
  }

  function flipCushion(idx: number) {
    if (cushionReveals.some((c) => c.idx === idx)) return;
    Sfx.play("ui.wood");
    const cur = stateRef.current;
    if (!cur) return;
    const roll = applyCushionFlip(cur, Math.random);
    mutate(() => roll.state);
    setCushionReveals((prev) => [
      ...prev,
      {
        idx,
        lootId: roll.lootId,
        label: roll.label,
        pcGain: roll.pcGain,
        revealedAt: Date.now(),
        tier: roll.tier,
        frugalityGained: roll.frugalityGained,
      },
    ]);
    if (roll.tier === "jackpot") Sfx.play("win.big");
    else if (roll.tier === "high") Sfx.play("coins.shower");
    else if (roll.pcGain > 0) Sfx.play("coin.drop");
    else Sfx.play("ui.soft");
  }

  function closeCouch() {
    setCouchModalOpen(false);
    setCouch(null);
    setCushionReveals([]);
  }

  function resolveLostWallet(choice: "return" | "keep") {
    if (walletModalChoice === "submitting") return;
    setWalletModalChoice("submitting");
    const cur = stateRef.current;
    if (!cur) {
      setWalletModalChoice(null);
      setLostWallet(null);
      return;
    }
    const next = applyResolveLostWallet(cur, choice);
    mutate(() => next);
    Sfx.play(choice === "keep" ? "coins.shower" : "ui.confirm");
    setWalletModalChoice(null);
    setLostWallet(null);
  }

  function rollItUp() {
    Sfx.play("chips.stack");
    const cur = stateRef.current;
    if (!cur) return;
    const result = applyPrestige(cur);
    if (!result.ok) return;
    mutate(() => result.state);
    setPrestigeOpen(false);
    setCoins([]);
    Sfx.play("coins.shower");
    setPrestigeCelebration(result.awarded);
    window.setTimeout(() => setPrestigeCelebration(null), 2500);
  }

  /** Bank It — server-authoritative because it touches the wallet
   *  ledger. Posts the current state blob; server runs `applyBank`,
   *  credits wallet, saves state, returns new state + payout. */
  async function bank() {
    const cur = stateRef.current;
    if (!cur || cur.cents <= 0) return;
    Sfx.play("chips.stack");
    try {
      // Make sure the very latest state is what the server sees —
      // mirror to localStorage first so a hard crash mid-POST still
      // recovers the right snapshot on next mount.
      mirrorLocal(cur);
      const r = await fetch("/api/earn/penny-pinchers/bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: cur }),
      });
      if (!r.ok) return;
      const d = (await r.json()) as {
        payoutCents: number;
        state: PennyPinchersGameState;
        walletBalance: number;
      };
      window.dispatchEvent(new CustomEvent("lg:balance", { detail: undefined }));
      const swept = applyAchievementSweep(d.state);
      stateRef.current = swept.state;
      setState(swept.state);
      setWalletBalance(d.walletBalance);
      // Bank just persisted the state server-side; no need to mark
      // dirty (server already has the latest).
      dirtyRef.current = false;
      setLastSavedAt(new Date().toISOString());
      if (swept.newlyUnlocked.length > 0) {
        Sfx.play("win.levelup");
        setAchievementToasts((prev) => [...prev, ...swept.newlyUnlocked]);
        window.setTimeout(() => {
          setAchievementToasts((prev) =>
            prev.filter((id) => !swept.newlyUnlocked.includes(id)),
          );
        }, 6000);
      }
      Sfx.play("coins.shower");
      setBankCelebration(d.payoutCents);
      window.setTimeout(() => setBankCelebration(null), 1600);
    } catch { /* offline — try again on next click */ }
  }

  /** Buy a relic chest — called by the RelicShop child. Runs the
   *  roll locally and returns the result so the modal can spin. */
  function buyChest(tier: ChestTier): ChestRollResult | null {
    const cur = stateRef.current;
    if (!cur) return null;
    const result = applyOpenChest(cur, tier, Math.random);
    if (!result.ok) return null;
    mutate(() => result.state);
    return {
      tier,
      relicId: result.relicId,
      label: result.label,
      rarity: result.rarity as RelicRarity,
      description: result.description,
      newLevel: result.newLevel,
      maxLevel: result.maxLevel,
      duplicateAtMax: result.duplicateAtMax,
      refund: result.refund,
    };
  }

  // Smooth-tween the HUD numbers so they count up instead of
  // snapping on each state poll. Lifetime clicks tweens at 0.6s
  // (small step-by-step deltas read fine), helper rate at 0.5s.
  // IMPORTANT: these hooks must run on every render, including
  // the loading-state pass below where we early-return — calling
  // them inside an `if (server)` branch produces React error #310
  // (hook count mismatch between renders).
  const tweenedRateLive = useTween(
    server ? helperRatePcPerSec(server.helpers, server.perm) : 0,
    500,
  );
  const tweenedClicksLive = useTween(server?.lifetimeClicks ?? 0, 600);

  if (!server) {
    return <p className="text-mute" style={{ padding: "var(--sp-5)" }}>Loading…</p>;
  }

  const unlocked = unlockedCoins(upgrades);
  const ratePcPerSec = helperRatePcPerSec(server.helpers, server.perm);
  const tweenedRate = tweenedRateLive;
  const tweenedClicks = tweenedClicksLive;
  const now = Date.now();
  // Prestige is now gated on CURRENT cents (the cents you cash in
  // when you prestige), not lifetime PC. Tokens scale with how
  // much you've saved at the moment of prestige — so the bar
  // tracks current cents vs the threshold.
  const canRoll = localCents >= server.prestige.thresholdPC && server.prestige.tokensIfRolled > 0;
  const lifetimeProgress = Math.min(1, localCents / server.prestige.thresholdPC);
  const projectedPayout = Math.floor(localCents / server.bank.pcPerWalletCent);

  return (
    <div className="stack" style={{ gap: "var(--sp-4)" }}>
      {welcomeBack != null && (
        <div
          style={{
            background: "var(--surface-highlight)",
            border: "3px solid var(--gold-300)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: "var(--ink-900)",
            textAlign: "center",
          }}
        >
          ★ Welcome back — your helpers earned <b>{welcomeBack.toLocaleString()} PC</b> while you were away.
        </div>
      )}

      {upgradeError && (
        <div
          role="alert"
          style={{
            background: "var(--crimson-500)",
            color: "var(--parchment-50)",
            border: "3px solid var(--ink-900)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 13,
            letterSpacing: "var(--ls-loose)",
            textAlign: "center",
            boxShadow: "0 0 12px rgba(255, 85, 68, 0.55)",
          }}
        >
          {upgradeError}
        </div>
      )}

      {activeEvent && (
        <div
          style={{
            background: activeEvent.id === "coin_storm" ? "var(--gold-300)" : "var(--sky-300)",
            border: "3px solid var(--ink-900)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: "var(--ink-900)",
            textAlign: "center",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            animation: "game-event-pulse 1.6s ease-in-out infinite",
          }}
        >
          {EVENTS[activeEvent.id].label} · {EVENTS[activeEvent.id].blurb} ·{" "}
          {Math.max(0, Math.ceil((activeEvent.endsAt - now) / 1000))}s
        </div>
      )}

      {frenzyEndsAt != null && frenzyEndsAt > now && (
        <div
          style={{
            background: "linear-gradient(90deg, var(--gold-300), var(--gold-500), var(--gold-300))",
            backgroundSize: "200% 100%",
            border: "3px solid var(--ink-900)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 14,
            color: "var(--ink-900)",
            textAlign: "center",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textShadow: "1px 1px 0 var(--gold-100)",
            animation: "pp-frenzy-shine 1.4s linear infinite, game-event-pulse 1.4s ease-in-out infinite",
          }}
        >
          ★ Money Frenzy! · 2× clicks · {Math.max(0, Math.ceil((frenzyEndsAt - now) / 1000))}s
          <style>{`
            @keyframes pp-frenzy-shine {
              0%   { background-position: 0% 50%; }
              100% { background-position: 200% 50%; }
            }
          `}</style>
        </div>
      )}

      {activeBlessings.length > 0 && (
        <div
          className="row"
          style={{
            gap: 8,
            flexWrap: "wrap",
            padding: "var(--sp-2)",
            background: "var(--parchment-100)",
            border: "2px solid var(--saddle-300)",
          }}
        >
          {activeBlessings.map((b) => {
            const def = BLESSINGS[b.id];
            const left = Math.max(0, Math.ceil((b.endsAt - now) / 1000));
            return (
              <span
                key={b.id}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "var(--surface-highlight)",
                  border: "2px solid var(--gold-300)",
                  padding: "2px 8px",
                  color: "var(--ink-900)",
                }}
              >
                ✦ {def.label} · {left}s
              </span>
            );
          })}
        </div>
      )}

      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "stretch",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        <div
          className="panel"
          style={{
            padding: "var(--sp-4) var(--sp-5)",
            flex: "2 1 340px",
            minWidth: 280,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="text-mute" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Pinch Cents
            </div>
            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              aria-label="How to play"
              title="How to play"
              style={{
                // Bigger touch target on phones — 22px was below the
                // 44px HIG floor and felt fiddly. Sized inline so we
                // don't need a media query just for one button.
                width: 32,
                height: 32,
                padding: 0,
                background: "var(--saddle-200)",
                border: "2px solid var(--ink-900)",
                borderRadius: "50%",
                fontFamily: "var(--font-display)",
                fontSize: 16,
                color: "var(--ink-900)",
                cursor: "pointer",
                lineHeight: "28px",
                transition: "transform 120ms, box-shadow 200ms",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
            >
              ?
            </button>
          </div>
          <div
            key={pcPulseKey}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 40,
              lineHeight: 1.1,
              marginTop: 4,
              marginBottom: 6,
              // Theme-aware so the counter inverts on dark themes —
              // --fg flips dark/light vs panel bg, --fg-muted gives a
              // mid-tone drop. The click pulse keeps a gold ring glow
              // for the "money" feel, layered on top of the theme
              // shadow.
              color: "var(--fg)",
              textShadow: "2px 2px 0 var(--fg-muted)",
              animation: "pp-pc-pulse 220ms ease-out",
              transformOrigin: "left center",
            }}
          >
            {Math.floor(localCents).toLocaleString()} PC
          </div>
          <style>{`
            @keyframes pp-pc-pulse {
              0%   { transform: scale(1); }
              35%  { transform: scale(1.12); text-shadow: 2px 2px 0 var(--fg-muted), 0 0 14px rgba(255,196,64,0.85); }
              100% { transform: scale(1); }
            }
          `}</style>
          <div className="text-mute" style={{ fontSize: 11 }}>
            Helpers: {Math.round(tweenedRate).toLocaleString()} PC/sec · Lifetime clicks {Math.round(tweenedClicks).toLocaleString()}
          </div>
          {/* Frugality badge — pulled out into its own pill because
              it's hard to earn, persists across runs, and the
              previous tiny line buried the only +PC stat the player
              actually controls. Shows the live click bonus the
              points are converting to (+0.5% PC each per point). */}
          {(() => {
            const f = server.frugality;
            const pos = f > 0;
            const neg = f < 0;
            const pcBonusPct = pos ? (f * 0.5).toFixed(1) : "0.0";
            const accent = pos
              ? "var(--cactus-500)"
              : neg
              ? "var(--crimson-500)"
              : "var(--saddle-400)";
            const bg = pos
              ? "rgba(60, 130, 70, 0.15)"
              : neg
              ? "rgba(180, 60, 60, 0.15)"
              : "var(--parchment-200)";
            return (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  border: `2px solid ${accent}`,
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-display)",
                  color: "var(--ink-900)",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: accent,
                    letterSpacing: "var(--ls-loose)",
                    textTransform: "uppercase",
                  }}
                >
                  {pos ? "✓" : neg ? "✗" : "·"} Frugality
                </span>
                <span
                  style={{
                    fontSize: 16,
                    color: accent,
                    fontWeight: "bold",
                  }}
                >
                  {pos ? `+${f}` : f}
                </span>
                {pos && (
                  <span
                    className="text-mute"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.04em",
                      marginLeft: "auto",
                      color: "var(--saddle-500)",
                    }}
                  >
                    +{pcBonusPct}% PC every click
                  </span>
                )}
                {!pos && !neg && (
                  <span
                    className="text-mute"
                    style={{ fontSize: 10, marginLeft: "auto", color: "var(--saddle-500)" }}
                  >
                    Earn through wallets, fountain &amp; cushions
                  </span>
                )}
              </div>
            );
          })()}
          {(() => {
            // Always render — even at rest the bar shows "0 / 5 → Warm"
            // so the player has a persistent target rather than a panel
            // that pops in and out as they tap.
            const tier = streakTierFor(streakClicksRef.current, now);
            const nextTier = STREAK_TIERS.find((t) => t.threshold > tier.threshold);
            const max = nextTier ? nextTier.threshold : tier.threshold;
            const pct = nextTier ? Math.min(100, (streakCount / max) * 100) : 100;
            const isFrenzy = frenzyEndsAt != null && frenzyEndsAt > now;
            const idle = streakCount === 0;
            const label = idle ? "Idle" : tier.label;
            return (
              <div
                style={{
                  marginTop: 6,
                  padding: "4px 6px",
                  border: `2px solid ${isFrenzy ? "var(--gold-300)" : "var(--saddle-300)"}`,
                  background: isFrenzy ? "var(--surface-highlight)" : "var(--parchment-200)",
                  fontFamily: "var(--font-display)",
                  fontSize: 10,
                  color: "var(--ink-900)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  opacity: idle ? 0.75 : 1,
                  transition: "opacity 200ms",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>Pinch Streak · {label}</span>
                  <span style={{ color: idle ? "var(--saddle-400)" : "var(--gold-500)" }}>
                    {tier.multiplier}×
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    marginTop: 3,
                    background: "var(--saddle-200)",
                    border: "1px solid var(--ink-900)",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: isFrenzy ? "var(--gold-500)" : "var(--cactus-300)",
                      transition: "width 200ms linear",
                    }}
                  />
                </div>
                <div
                  className="text-mute"
                  style={{ fontSize: 9, marginTop: 2, letterSpacing: "0.04em", textTransform: "none" }}
                >
                  {nextTier
                    ? `${streakCount} / ${nextTier.threshold} → ${nextTier.label}`
                    : `${streakCount} clicks · max tier`}
                </div>
              </div>
            );
          })()}
        </div>
        {/* Right column — Prestige (Roll It Up) on top, Bank It tucked
            beneath. Stacking these saves a row of horizontal real estate
            and pairs the two outflow actions visually. */}
        <div className="stack" style={{ flex: "1 1 260px", minWidth: 260, gap: "var(--sp-3)" }}>
          <div
            className="panel"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              background: canRoll ? "var(--surface-highlight)" : undefined,
              border: canRoll ? "3px solid var(--gold-300)" : undefined,
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="text-mute" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Prestige
              </div>
              <div className="text-mute" style={{ fontSize: 11 }}>
                ×{server.prestige.count} · {server.prestige.bankTokens.toLocaleString()} ★
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink-900)" }}>
              {canRoll
                ? `+${server.prestige.tokensIfRolled.toLocaleString()} ★ Tokens`
                : `${Math.round(lifetimeProgress * 100)}% to next prestige`}
            </div>
            <div
              style={{
                height: 6,
                background: "var(--parchment-200)",
                border: "2px solid var(--ink-900)",
                marginTop: 4,
                marginBottom: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.round(lifetimeProgress * 100)}%`,
                  height: "100%",
                  background: canRoll ? "var(--gold-500)" : "var(--cactus-300)",
                  transition: "width 400ms var(--ease-out)",
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!canRoll}
              onClick={() => setPrestigeOpen(true)}
              style={{ width: "100%" }}
            >
              {canRoll
                ? "Prestige →"
                : `${(localCents / 1000).toFixed(0)}k / ${(server.prestige.thresholdPC / 1000).toFixed(0)}k cents`}
            </button>
          </div>
          <div
            className="panel"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              background: projectedPayout > 0 ? "var(--surface-highlight)" : undefined,
            }}
          >
            <div className="text-mute" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Bank It
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-900)" }}>
              ≈ {projectedPayout.toLocaleString()} ¢
            </div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={projectedPayout <= 0}
              onClick={bank}
              style={{ marginTop: 6, width: "100%" }}
            >
              {projectedPayout > 0 ? "Bank It" : "Need more PC"}
            </button>
          </div>
          {/* Save status chip — countdown to next autosave + transient
              Saved / Failed pulse. Tells the player their progress is
              persisting even though every action is instant locally. */}
          <SaveChip
            countdown={saveCountdown}
            status={saveStatus}
            lastSavedAt={lastSavedAt}
          />
        </div>
      </div>

      <div
        className="row"
        style={{
          alignItems: "stretch",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        {/* Play area — sidewalk concrete texture: a faint diagonal
            tile-crack grid + speckled aggregate dots, layered over
            a gentle warm gradient so coins still pop against it. */}
        <div
          ref={playRef}
          className="panel"
          style={{
            position: "relative",
            flex: "2 1 360px",
            minHeight: 420,
            backgroundColor: "var(--saddle-200)",
            backgroundImage: `
              radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.18) 100%),
              repeating-linear-gradient(135deg,
                transparent 0,
                transparent 56px,
                rgba(0,0,0,0.06) 56px,
                rgba(0,0,0,0.06) 60px),
              repeating-linear-gradient(45deg,
                transparent 0,
                transparent 56px,
                rgba(0,0,0,0.06) 56px,
                rgba(0,0,0,0.06) 60px),
              radial-gradient(circle at 25% 25%, rgba(0,0,0,0.08) 1px, transparent 2px),
              radial-gradient(circle at 75% 60%, rgba(0,0,0,0.06) 1px, transparent 2px),
              radial-gradient(circle at 40% 80%, rgba(255,255,255,0.05) 1px, transparent 2px)
            `,
            backgroundSize: "100% 100%, 60px 60px, 60px 60px, 8px 8px, 12px 12px, 10px 10px",
            overflow: "hidden",
            border: "3px solid var(--ink-900)",
            cursor: "crosshair",
            // Rapid-fire clicking would otherwise drag-select coin labels
            // and the +PC pops; disabling text selection inside the arena
            // (and the iOS long-press callout) keeps the click stream clean.
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          {/* Event-atmosphere layer — sits below coins via z-index 0
              vs coins/pops at default. Pure cosmetic; pointer-events
              off so clicks pass through to coins. */}
          {activeEvent?.id === "coin_storm" && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(ellipse at center, rgba(255,200,60,0.22) 0%, rgba(255,200,60,0.05) 50%, rgba(0,0,0,0) 80%)",
                animation: "pp-storm-shine 3.6s ease-in-out infinite",
                zIndex: 0,
              }}
            />
          )}
          {activeEvent?.id === "rainy_day" && (
            <>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "linear-gradient(180deg, rgba(70,120,180,0.22) 0%, rgba(70,120,180,0.08) 100%)",
                  zIndex: 0,
                }}
              />
              {Array.from({ length: 28 }).map((_, i) => {
                const left = (i * 3.6 + (i * 31) % 7) % 100;
                const delay = (i * 0.13) % 1.6;
                const duration = 0.9 + ((i * 7) % 5) / 10;
                return (
                  <span
                    key={`rain-${i}`}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      top: -16,
                      width: 1,
                      height: 12,
                      background: "linear-gradient(180deg, rgba(180,210,255,0) 0%, rgba(180,210,255,0.85) 100%)",
                      pointerEvents: "none",
                      animation: `pp-raindrop ${duration}s ${delay}s linear infinite`,
                      zIndex: 0,
                    }}
                  />
                );
              })}
            </>
          )}
          {frenzyEndsAt != null && frenzyEndsAt > Date.now() && (
            <>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "radial-gradient(ellipse at center, rgba(255,220,100,0.30) 0%, rgba(255,180,40,0.10) 60%, rgba(0,0,0,0) 90%)",
                  animation: "pp-frenzy-aura 1.1s ease-in-out infinite",
                  zIndex: 0,
                }}
              />
              {Array.from({ length: 18 }).map((_, i) => {
                const left = (i * 5.5 + (i * 13) % 11) % 100;
                const top = (i * 11.1 + (i * 7) % 23) % 100;
                const delay = (i * 0.07) % 0.9;
                return (
                  <span
                    key={`spark-${i}`}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      top: `${top}%`,
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "var(--gold-300)",
                      boxShadow: "0 0 8px rgba(255,220,100,0.9)",
                      pointerEvents: "none",
                      animation: `pp-spark-twinkle 1.2s ${delay}s ease-in-out infinite`,
                      zIndex: 0,
                    }}
                  />
                );
              })}
            </>
          )}
          <style>{`
            @keyframes pp-storm-shine {
              0%, 100% { opacity: 0.55; }
              50%      { opacity: 1; }
            }
            @keyframes pp-frenzy-aura {
              0%, 100% { opacity: 0.7; transform: scale(1); }
              50%      { opacity: 1;   transform: scale(1.04); }
            }
            @keyframes pp-raindrop {
              0%   { transform: translateY(0); opacity: 0; }
              10%  { opacity: 0.85; }
              90%  { opacity: 0.85; }
              100% { transform: translateY(440px); opacity: 0; }
            }
            @keyframes pp-spark-twinkle {
              0%, 100% { opacity: 0; transform: scale(0.4); }
              50%      { opacity: 1; transform: scale(1.4); }
            }
          `}</style>
          {coins.map((c) => (
            <CoinSprite
              key={c.id}
              coin={c.coin}
              traits={c.traits}
              pc={c.mergedPC}
              x={c.x}
              y={c.y}
              spawnedAt={c.spawnedAt}
              lifetimeMs={COIN_LIFETIME_MS + (c.traits.includes("frosted") ? FROSTED_LIFETIME_BONUS_MS : 0)}
              mergingTo={c.mergingTo}
              mergeSlideMs={mergeSlideMs}
              firstTapAt={c.firstTapAt}
              onClick={() => clickCoin(c)}
            />
          ))}
          {grabs.map((g) => {
            const isAuto = g.kind === "auto";
            const ringColor = isAuto ? "var(--cactus-300)" : "#7adcff";
            const glow = isAuto ? "rgba(120,220,160,0.85)" : "rgba(122,220,255,0.85)";
            return (
              <span
                key={g.id}
                aria-hidden
                style={{
                  position: "absolute",
                  left: g.x,
                  top: g.y,
                  width: 0,
                  height: 0,
                  pointerEvents: "none",
                  zIndex: 9,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    transform: "translate(-50%, -50%)",
                    width: isAuto ? 64 : 80,
                    height: isAuto ? 64 : 80,
                    borderRadius: "50%",
                    border: `3px ${isAuto ? "dashed" : "solid"} ${ringColor}`,
                    boxShadow: `0 0 14px ${glow}, inset 0 0 10px ${glow}`,
                    animation: "pp-grab-ring 480ms ease-out forwards",
                  }}
                />
                {!isAuto && (
                  <>
                    {/* Two small "pincher" dots that pinch inward —
                        reads as a two-finger pinch from the side.
                        --dx/--dy carry the start offset (left + right). */}
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: ringColor,
                        boxShadow: `0 0 8px ${glow}`,
                        ["--dx" as string]: "-32px",
                        ["--dy" as string]: "0px",
                        animation: "pp-grab-pinch 480ms ease-out forwards",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: ringColor,
                        boxShadow: `0 0 8px ${glow}`,
                        ["--dx" as string]: "32px",
                        ["--dy" as string]: "0px",
                        animation: "pp-grab-pinch 480ms ease-out forwards",
                      }}
                    />
                  </>
                )}
              </span>
            );
          })}
          {bursts.map((b) => {
            const cfg =
              b.flavour === "ancient"
                ? { count: 12, radius: 46, size: 7, color: "#c8ffd8", glow: "rgba(120,220,160,0.95)", duration: 720 }
                : b.flavour === "shiny"
                ? { count: 10, radius: 36, size: 6, color: "var(--gold-300)", glow: "rgba(255,220,90,0.95)", duration: 600 }
                : b.flavour === "cursed"
                ? { count: 10, radius: 36, size: 6, color: "#ff8585", glow: "rgba(220,80,80,0.95)", duration: 600 }
                : { count: 6,  radius: 28, size: 6, color: "var(--gold-500)", glow: "rgba(255,196,64,0.7)", duration: 480 };
            return (
              <div
                key={b.id}
                aria-hidden
                style={{
                  position: "absolute",
                  left: b.x,
                  top: b.y,
                  width: 0,
                  height: 0,
                  pointerEvents: "none",
                  zIndex: 9,
                }}
              >
                {Array.from({ length: cfg.count }).map((_, i) => {
                  const angle = (i / cfg.count) * Math.PI * 2;
                  const dx = Math.cos(angle) * cfg.radius;
                  const dy = Math.sin(angle) * cfg.radius;
                  return (
                    <span
                      key={i}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: cfg.size,
                        height: cfg.size,
                        borderRadius: "50%",
                        background: cfg.color,
                        boxShadow: `0 0 ${cfg.size + 2}px ${cfg.glow}`,
                        transform: "translate(-50%, -50%)",
                        ["--dx" as string]: `${dx}px`,
                        ["--dy" as string]: `${dy}px`,
                        animation: `pp-burst-fly ${cfg.duration}ms ease-out forwards`,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
          {pops.map((p) => (
            <div
              key={p.id}
              aria-hidden
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                fontFamily: "var(--font-display)",
                fontSize: p.shiny ? 22 : 16,
                color: p.shiny ? "var(--gold-300)" : "var(--gold-500)",
                textShadow: p.shiny
                  ? "0 0 6px rgba(255,220,90,0.95), 1px 1px 0 rgba(0,0,0,0.6)"
                  : "1px 1px 0 rgba(0,0,0,0.55)",
                pointerEvents: "none",
                animation: "pp-pop-rise 800ms ease-out forwards",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              +{p.pc.toLocaleString()}
            </div>
          ))}
          <style>{`
            @keyframes pp-pop-rise {
              0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
              20%  { transform: translate(-50%, -60%) scale(1.15); opacity: 1; }
              100% { transform: translate(-50%, -160%) scale(1); opacity: 0; }
            }
            @keyframes pp-burst-fly {
              0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
              100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.3); opacity: 0; }
            }
            /* Auto-Picker / Two-Finger grab ring — quick contracting
               flash so the player can SEE the catch happen. */
            @keyframes pp-grab-ring {
              0%   { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
              25%  { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
              100% { transform: translate(-50%, -50%) scale(0.55); opacity: 0; }
            }
            /* Two-Finger pinch dots — pair of dots travelling from
               (--dx, --dy) inward to the center, fading on arrival. */
            @keyframes pp-grab-pinch {
              0%   { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.6); opacity: 0; }
              35%  { transform: translate(calc(-50% + var(--dx) * 0.7), calc(-50% + var(--dy) * 0.7)) scale(1);   opacity: 1; }
              100% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
            }
          `}</style>
          {fountain && (
            <button
              type="button"
              onClick={() => setFountainModalOpen(true)}
              aria-label="Wishing fountain"
              style={{
                position: "absolute",
                left: fountain.x - 40,
                top: fountain.y - 40,
                width: 80,
                height: 80,
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                filter: "drop-shadow(0 0 14px rgba(120,200,255,0.65)) drop-shadow(0 3px 0 rgba(0,0,0,0.4))",
                animation: "pp-coin-spawn 240ms var(--ease-out, ease-out), pp-fountain-bob 1.6s ease-in-out infinite",
              }}
            >
              <FountainSprite />
              <style>{`
                @keyframes pp-fountain-bob {
                  0%, 100% { transform: translateY(0); }
                  50%      { transform: translateY(-3px); }
                }
                @keyframes pp-fountain-water {
                  0%, 100% { transform: scaleY(0.85); opacity: 0.85; }
                  50%      { transform: scaleY(1.15); opacity: 1; }
                }
                @keyframes pp-fountain-glint {
                  0%, 80%, 100% { opacity: 0.35; }
                  90%           { opacity: 1; }
                }
              `}</style>
            </button>
          )}
          {couch && (
            <button
              type="button"
              onClick={() => setCouchModalOpen(true)}
              aria-label="Couch"
              style={{
                position: "absolute",
                left: couch.x - 56,
                top: couch.y - 32,
                width: 112,
                height: 72,
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                filter: "drop-shadow(0 0 18px rgba(212,165,116,0.55)) drop-shadow(0 4px 0 rgba(0,0,0,0.45))",
                animation: "pp-coin-spawn 240ms var(--ease-out, ease-out), pp-couch-call 2.2s ease-in-out infinite",
              }}
            >
              <CouchSprite />
              <style>{`
                @keyframes pp-couch-call {
                  0%, 100% { transform: translateY(0); }
                  50%      { transform: translateY(-2px); }
                }
                @keyframes pp-couch-mote {
                  0%   { transform: translateY(0)    scale(1);   opacity: 0; }
                  20%  {                                          opacity: 0.85; }
                  100% { transform: translateY(-22px) scale(0.4); opacity: 0; }
                }
              `}</style>
            </button>
          )}
          {lostWallet && (
            <button
              type="button"
              onClick={() => setWalletModalChoice("open")}
              aria-label="Lost wallet"
              style={{
                position: "absolute",
                left: lostWallet.x - 36,
                top: lostWallet.y - 26,
                width: 72,
                height: 52,
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                animation: "pp-wallet-bob 1.4s ease-in-out infinite",
              }}
            >
              <svg
                viewBox="0 0 36 26"
                width={72}
                height={52}
                shapeRendering="crispEdges"
                style={{
                  display: "block",
                  filter: "drop-shadow(0 0 8px rgba(255,196,64,0.85)) drop-shadow(2px 2px 0 rgba(0,0,0,0.4))",
                }}
              >
                {/* Outer leather body */}
                <rect x="2"  y="6"  width="32" height="18" fill="#1a0f08" />
                <rect x="3"  y="7"  width="30" height="16" fill="#6b3f24" />
                <rect x="3"  y="7"  width="30" height="2"  fill="#8b5a2b" />
                <rect x="3"  y="21" width="30" height="2"  fill="#3d2418" />
                {/* Top flap fold */}
                <rect x="6"  y="2"  width="24" height="6"  fill="#1a0f08" />
                <rect x="7"  y="3"  width="22" height="4"  fill="#8b5a2b" />
                <rect x="7"  y="3"  width="22" height="1"  fill="#a87545" />
                {/* Cash poking out — gold + green peeks */}
                <rect x="10" y="10" width="16" height="3"  fill="#f5c842" />
                <rect x="10" y="10" width="16" height="1"  fill="#fff8c2" />
                <rect x="11" y="13" width="14" height="2"  fill="#3d8a4d" />
                {/* Center clasp */}
                <rect x="16" y="15" width="4"  height="4"  fill="#1a0f08" />
                <rect x="17" y="16" width="2"  height="2"  fill="#f5c842" />
              </svg>
              <style>{`
                @keyframes pp-wallet-bob {
                  0%, 100% { transform: translateY(0); }
                  50%      { transform: translateY(-3px); }
                }
              `}</style>
            </button>
          )}
        </div>

        {/* Sidebar */}
        <div
          className="panel"
          style={{
            padding: "var(--sp-3)",
            flex: "1 1 280px",
            minWidth: 280,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-2)",
          }}
        >
          <div
            className="pp-tab-row"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              // 3×2 grid is intentional — six tabs split evenly into
              // two rows of three so the layout stays balanced and
              // the active button never lands alone on its own row.
            }}
          >
            <style>{`
              @media (max-width: 480px) {
                .pp-tab-row {
                  display: flex !important;
                  flex-wrap: nowrap !important;
                  overflow-x: auto;
                  -webkit-overflow-scrolling: touch;
                  scrollbar-width: thin;
                  padding-bottom: 4px;
                }
                .pp-tab-row > button {
                  flex: 0 0 auto !important;
                  min-width: 92px;
                }
              }
            `}</style>
            {([
              ["upgrades",     "Upgrades",     "✦"],
              ["helpers",      "Helpers",      "⚒"],
              ["tokens",       "Tokens",       "★"],
              ["achievements", "Trophies",     "♛"],
              ["album",        "Album",        "❒"],
              ["relics",       "Relics",       "◇"],
            ] as const).map(([id, label, icon]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`btn btn-sm${active ? "" : " btn-ghost"}`}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    paddingInline: 8,
                    position: "relative",
                    transform: active ? "translateY(-1px)" : undefined,
                    boxShadow: active
                      ? "0 0 0 2px var(--gold-300), 0 0 14px rgba(255,196,64,0.45)"
                      : undefined,
                    transition: "transform 120ms, box-shadow 200ms",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => setTab(id)}
                >
                  <span aria-hidden style={{ marginRight: 4 }}>{icon}</span>
                  {label}
                </button>
              );
            })}
          </div>
          {tab === "upgrades" ? (
            <UpgradeShop
              levels={upgrades}
              cents={localCents}
              onBuy={buyUpgrade}
              onBuyMax={buyMaxUpgrades}
              perm={server.perm}
              recentlyBoughtId={recentlyBoughtUpgradeId}
            />
          ) : tab === "helpers" ? (
            <HelperRoster
              counts={server.helpers as Record<HelperId, number>}
              cents={localCents}
              onHire={hireHelper}
              onHireMax={hireMaxHelpers}
              recentlyHiredId={recentlyHiredId}
            />
          ) : tab === "tokens" ? (
            <BankTokenShop
              levels={server.perm}
              bankTokens={server.prestige.bankTokens}
              onBuy={buyPermUpgrade}
              recentlyBoughtId={recentlyBoughtPermId}
            />
          ) : tab === "achievements" ? (
            <AchievementsPanel
              unlocked={new Set(server.achievements.unlocked)}
            />
          ) : tab === "album" ? (
            <AlbumPanel album={server.album} />
          ) : (
            <RelicShop
              frugality={server.frugality}
              relics={server.relics}
              onBuyChest={buyChest}
            />
          )}
        </div>
      </div>

      {/* Unlocked coin legend */}
      <div
        className="panel"
        style={{
          padding: "var(--sp-3)",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
          alignItems: "center",
        }}
      >
        <span
          className="text-mute"
          style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 4 }}
        >
          Unlocked coins
        </span>
        {COIN_ORDER.map((id) => {
          const isUnlocked = unlocked.includes(id);
          const def = COINS[id];
          const value = id === "penny" ? coinPCValue(id, upgrades) : def.basePC;
          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: isUnlocked ? 1 : 0.35,
                fontFamily: "var(--font-display)",
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: def.color,
                  border: `2px solid ${def.edge}`,
                }}
              />
              {def.label} <span className="text-mute">·</span> <span style={{ color: "var(--gold-500)" }}>{value} PC</span>
            </div>
          );
        })}
        {/* Auto-Picker pause toggle — pinned to the far-right via
            margin-left:auto so it sits opposite the "Unlocked
            coins" label. Hidden when Auto-Picker hasn't been
            bought yet (no point showing a control with nothing to
            pause). Useful for Pile-It-Up runs where you don't
            want auto-clicks to swipe a coin you're trying to
            merge. */}
        {autoPickerLevel > 0 && (
          <button
            type="button"
            className={`btn btn-sm ${autoPickerPaused ? "btn-ghost" : ""}`}
            onClick={() => setAutoPickerPaused((p) => !p)}
            aria-pressed={autoPickerPaused}
            style={{ marginLeft: "auto" }}
          >
            {autoPickerPaused ? "▶ Resume Auto-Picker" : "⏸ Pause Auto-Picker"}
          </button>
        )}
      </div>

      <PennyLeaderboard rows={server?.leaderboard ?? null} />

      {achievementToasts.length > 0 && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 80,
            right: 16,
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {achievementToasts.map((id) => {
            const def = ACHIEVEMENTS_BY_ID[id];
            if (!def) return null;
            return (
              <div
                key={id}
                style={{
                  background: "var(--surface-highlight)",
                  border: "3px solid var(--ink-900)",
                  padding: "8px 12px",
                  fontFamily: "var(--font-display)",
                  minWidth: 240,
                  boxShadow: "var(--sh-card-rest), var(--glow-gold)",
                  color: "var(--ink-900)",
                  animation: "pp-trophy-slide 6s cubic-bezier(.25, 1, .35, 1) forwards",
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--saddle-400)" }}>
                  Achievement Unlocked{def.reward > 0 ? ` · +${def.reward} ★` : ""}
                </div>
                <div style={{ fontSize: 14, color: "var(--ink-900)" }}>
                  {def.label}
                </div>
                <div className="text-mute" style={{ fontSize: 11 }}>
                  {def.description}
                </div>
              </div>
            );
          })}
          <style>{`
            @keyframes pp-trophy-slide {
              0%   { transform: translateX(120%); opacity: 0; }
              8%   { transform: translateX(-6px);  opacity: 1; }
              14%  { transform: translateX(0);     opacity: 1; }
              92%  { transform: translateX(0);     opacity: 1; }
              100% { transform: translateX(120%); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}

      {bankCelebration != null && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_700,
            pointerEvents: "none",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              color: "var(--gold-300)",
              letterSpacing: "0.06em",
              textShadow: "3px 3px 0 var(--ink-900), 0 0 18px rgba(255,196,64,0.85)",
              animation: "pp-bank-pop 1.6s ease-out forwards",
            }}
          >
            +{bankCelebration.toLocaleString()} ¢
          </div>
          {/* 12 falling coins — lighter than the prestige shower. */}
          {Array.from({ length: 12 }).map((_, i) => {
            const left = (i * 8.33) % 100;
            const delay = (i * 0.05) % 0.6;
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  top: -28,
                  left: `${left}%`,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #fff8c2, var(--gold-300) 60%, var(--gold-500) 100%)",
                  border: "2px solid var(--gold-500)",
                  boxShadow: "0 0 6px rgba(255,196,64,0.8)",
                  animation: `pp-bank-coin 1.5s ${delay}s ease-in forwards`,
                }}
              />
            );
          })}
          <style>{`
            @keyframes pp-bank-pop {
              0%   { transform: scale(0.7); opacity: 0; }
              25%  { transform: scale(1.18); opacity: 1; }
              80%  { transform: scale(1); opacity: 1; }
              100% { transform: scale(0.95); opacity: 0; }
            }
            @keyframes pp-bank-coin {
              0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(85vh) rotate(540deg); opacity: 0.4; }
            }
          `}</style>
        </div>
      )}

      {prestigeCelebration != null && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_800,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 50% 40%, rgba(255,200,60,0.45) 0%, rgba(255,200,60,0) 60%)",
            animation: "pp-prestige-celebrate 2.5s ease-out forwards",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h1, 36px)",
              color: "var(--gold-300)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textShadow: "3px 3px 0 var(--ink-900), 0 0 22px rgba(255,200,60,0.85)",
              animation: "pp-prestige-pop 800ms cubic-bezier(.2,1,.25,1)",
            }}
          >
            ★ +{prestigeCelebration.toLocaleString()} Tokens ★
          </div>
          {/* 24 coin sprites raining down */}
          {Array.from({ length: 24 }).map((_, i) => {
            const left = (i * 4.16) % 100;
            const delay = (i * 0.07) % 1.4;
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  top: -32,
                  left: `${left}%`,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #fff8c2, var(--gold-300) 60%, var(--gold-500) 100%)",
                  border: "2px solid var(--gold-500)",
                  boxShadow: "0 0 8px rgba(255,196,64,0.8)",
                  animation: `pp-prestige-coin 1.8s ${delay}s ease-in forwards`,
                }}
              />
            );
          })}
          <style>{`
            @keyframes pp-prestige-celebrate {
              0%   { opacity: 0;   transform: scale(0.95); }
              10%  { opacity: 1;   transform: scale(1); }
              80%  { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes pp-prestige-pop {
              0%   { transform: scale(0.6) rotate(-6deg); opacity: 0; }
              60%  { transform: scale(1.15) rotate(2deg); opacity: 1; }
              100% { transform: scale(1) rotate(0); opacity: 1; }
            }
            @keyframes pp-prestige-coin {
              0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0.4; }
            }
          `}</style>
        </div>
      )}

      {fountainModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Wishing fountain"
          onClick={() => setFountainModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              width: "min(480px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-3)",
                textAlign: "center",
              }}
            >
              Wishing Fountain
            </div>
            <p style={{ marginBottom: "var(--sp-3)", color: "var(--ink-900)" }}>
              Toss in some Pinch Cents — pick your blessing.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              <style>{`
                @keyframes pp-blessing-granted {
                  0%   { transform: scale(1);   box-shadow: 0 0 0 0 rgba(255,200,60,0); }
                  35%  { transform: scale(1.06); box-shadow: 0 0 0 4px rgba(255,200,60,0.95), 0 0 28px rgba(255,200,60,0.95); }
                  100% { transform: scale(1);   box-shadow: 0 0 0 4px rgba(255,200,60,0), 0 0 28px rgba(255,200,60,0); }
                }
              `}</style>
              {Object.values(BLESSINGS).map((b) => {
                const affordable = localCents >= b.cost;
                const granted = grantedBlessing === b.id;
                const dimByGrant = grantedBlessing != null && !granted;
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={!affordable || grantedBlessing != null}
                    onClick={() => buyBlessing(b.id)}
                    style={{
                      textAlign: "left",
                      background: granted
                        ? "var(--gold-300)"
                        : affordable ? "var(--surface-highlight)" : "var(--parchment-200)",
                      border: `2px solid ${granted ? "var(--gold-500)" : affordable ? "var(--gold-300)" : "var(--saddle-300)"}`,
                      padding: "10px 12px",
                      cursor: affordable && !grantedBlessing ? "pointer" : "default",
                      color: "var(--ink-900)",
                      opacity: dimByGrant ? 0.4 : 1,
                      animation: granted ? "pp-blessing-granted 800ms ease-out forwards" : undefined,
                      transition: "opacity 200ms",
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 13 }}>
                        {granted ? "✓ Granted!" : b.label}
                      </span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--gold-500)" }}>
                        {b.cost.toLocaleString()} PC
                      </span>
                    </div>
                    <div className="text-mute" style={{ fontSize: 11 }}>{b.blurb}</div>
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: "var(--sp-3)" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFountainModalOpen(false)}
              >
                Walk away
              </button>
            </div>
          </div>
        </div>
      )}

      {couchModalOpen && (() => {
        // Tally so the player can watch their couch take grow as
        // they flip — turns the modal into a mini score-screen
        // instead of four blind clicks.
        const totalPC = cushionReveals.reduce((sum, r) => sum + r.pcGain, 0);
        const totalFrugality = cushionReveals.reduce((sum, r) => sum + r.frugalityGained, 0);
        const allDone = cushionReveals.length >= COUCH_CUSHIONS;
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Couch cushion dive"
            onClick={() => closeCouch()}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9_500,
              background: "rgba(26,15,8,0.78)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              backdropFilter: "blur(3px)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="panel-wood"
              style={{
                width: "min(560px, 100%)",
                padding: "var(--sp-5)",
                border: "4px solid var(--ink-900)",
                boxShadow: "var(--sh-popover), var(--glow-gold)",
              }}
            >
              {/* Title row with running total */}
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--sp-2)" }}>
                <div
                  className="uppercase"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--fs-h3)",
                    color: "var(--gold-300)",
                    letterSpacing: "var(--ls-loose)",
                    textShadow: "2px 2px 0 var(--ink-900)",
                  }}
                >
                  Couch Cushion Dive
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    color: "var(--gold-300)",
                    background: "rgba(0,0,0,0.35)",
                    padding: "4px 10px",
                    border: "2px solid var(--ink-900)",
                    minWidth: 90,
                    textAlign: "right",
                  }}
                >
                  +{totalPC.toLocaleString()} PC
                </div>
              </div>
              <p className="text-mute" style={{ fontSize: 12, marginBottom: "var(--sp-4)" }}>
                Flip {COUCH_CUSHIONS} cushions — keep what you find. Lint counts
                as patience: <span style={{ color: "var(--cactus-500)" }}>+1 Frugality</span> if you pull one.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: "var(--sp-4)",
                }}
              >
                {Array.from({ length: COUCH_CUSHIONS }).map((_, idx) => {
                  const reveal = cushionReveals.find((r) => r.idx === idx);
                  const flipped = !!reveal;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => flipCushion(idx)}
                      disabled={flipped}
                      aria-label={flipped ? `Cushion ${idx + 1}: ${reveal!.label}` : `Cushion ${idx + 1}, unrevealed`}
                      style={{
                        aspectRatio: "1.4 / 1",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: flipped ? "default" : "pointer",
                        perspective: "700px",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          height: "100%",
                          transformStyle: "preserve-3d",
                          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                          transition: "transform 540ms cubic-bezier(.35, 1.45, .55, 1)",
                        }}
                      >
                        {/* Front face — stitched cushion sprite */}
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            backfaceVisibility: "hidden",
                            background:
                              "radial-gradient(circle at 30% 30%, #c8884a 0%, #8a4f25 60%, #4a2818 100%)",
                            border: "3px solid #1a0f08",
                            borderRadius: 14,
                            display: "grid",
                            placeItems: "center",
                            color: "rgba(0,0,0,0.65)",
                            fontFamily: "var(--font-display)",
                            fontSize: 32,
                            boxShadow:
                              "inset 0 -6px 0 rgba(0,0,0,0.3), inset 0 6px 0 rgba(255,255,255,0.15), 0 4px 0 rgba(0,0,0,0.5)",
                          }}
                        >
                          {/* Stitch outline — dashed border just inside the cushion */}
                          <span
                            aria-hidden
                            style={{
                              position: "absolute",
                              inset: 8,
                              border: "2px dashed rgba(255, 220, 168, 0.45)",
                              borderRadius: 10,
                              pointerEvents: "none",
                            }}
                          />
                          <span
                            style={{
                              position: "relative",
                              zIndex: 1,
                              color: "var(--gold-300)",
                              textShadow: "2px 2px 0 var(--ink-900)",
                            }}
                          >
                            ?
                          </span>
                        </div>
                        {/* Back face — tier-themed loot reveal */}
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            backfaceVisibility: "hidden",
                            transform: "rotateY(180deg)",
                            ...cushionRevealStyle(reveal?.tier),
                            borderRadius: 14,
                            display: "grid",
                            placeItems: "center",
                            color: "var(--ink-900)",
                            fontFamily: "var(--font-display)",
                            padding: 10,
                            textAlign: "center",
                          }}
                        >
                          {flipped && <CushionLootReveal reveal={reveal!} />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Frugality + done row */}
              <div className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                <div
                  className="text-mute"
                  style={{
                    fontSize: 11,
                    minHeight: 16,
                  }}
                >
                  {totalFrugality > 0 && (
                    <span style={{ color: "var(--cactus-500)" }}>
                      ✓ +{totalFrugality} Frugality
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={allDone ? "btn" : "btn btn-ghost"}
                  onClick={closeCouch}
                  style={allDone
                    ? { background: "var(--gold-300)", color: "var(--ink-900)" }
                    : undefined}
                >
                  {allDone ? "✓ Pocket the lot" : "Walk away"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {walletModalChoice != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lost wallet"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            className="panel-wood"
            style={{
              width: "min(440px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-3)",
                textAlign: "center",
              }}
            >
              You Found a Wallet
            </div>
            <p style={{ color: "var(--ink-900)", marginBottom: "var(--sp-2)" }}>
              Lost on the sidewalk, fat with cash. There&rsquo;s an ID inside —
              someone&rsquo;s missing this.
            </p>
            <p className="text-mute" style={{ fontSize: 12, marginBottom: "var(--sp-4)" }}>
              Returning it raises Frugality (unlocks future perks). Keeping the
              change pays {Math.min(LOST_WALLET_KEEP_MAX_PC, LOST_WALLET_KEEP_PC + Math.floor(localCents * LOST_WALLET_KEEP_WEALTH_PCT)).toLocaleString()} PC right now (15% of your stack on top of a 500 PC floor) but takes a Frugality
              point with it.
            </p>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={walletModalChoice === "submitting"}
                onClick={() => resolveLostWallet("return")}
              >
                Return It
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={walletModalChoice === "submitting"}
                onClick={() => resolveLostWallet("keep")}
              >
                Keep the Change · +{Math.min(LOST_WALLET_KEEP_MAX_PC, LOST_WALLET_KEEP_PC + Math.floor(localCents * LOST_WALLET_KEEP_WEALTH_PCT)).toLocaleString()} PC
              </button>
            </div>
          </div>
        </div>
      )}

      {prestigeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Prestige"
          onClick={() => setPrestigeOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              width: "min(480px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-3)",
                textAlign: "center",
              }}
            >
              Prestige?
            </div>
            <p style={{ marginBottom: "var(--sp-3)", color: "var(--ink-900)" }}>
              Cash in your pocket and start fresh. You&rsquo;ll trade:
            </p>
            <ul style={{ margin: "0 0 var(--sp-3) 16px", color: "var(--ink-900)" }}>
              <li>
                <b>{Math.floor(localCents).toLocaleString()} Pinch Cents</b> in your pocket (sacrificed for the tokens)
              </li>
              <li>Every run upgrade you&rsquo;ve bought this cycle</li>
              <li>Every helper you&rsquo;ve hired this cycle</li>
            </ul>
            <p style={{ marginBottom: "var(--sp-3)", color: "var(--ink-900)" }}>
              You&rsquo;ll keep:
            </p>
            <ul style={{ margin: "0 0 var(--sp-3) 16px", color: "var(--ink-900)" }}>
              <li>Wallet balance + lifetime banked</li>
              <li>Every Permanent upgrade in the Tokens shop</li>
              <li>
                <b>+{server.prestige.tokensIfRolled.toLocaleString()} ★ Bank Tokens</b> to spend on Permanents
              </li>
              <li className="text-mute" style={{ fontSize: 13 }}>
                Tip: tokens follow a sqrt curve — 100k → 5 ★, 200k → 7 ★, 500k → 11 ★, 1M → 15 ★. Quick prestiges pay off; sitting past 1M earns diminishing returns.
              </li>
            </ul>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPrestigeOpen(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={rollItUp}
              >
                Prestige
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Vertical slot-reel reveal for a flipped Couch Cushion. Cycles
 * through six labels then lands on the actual reward, with the
 * +N PC line fading in afterward. Pure CSS transition keyed to
 * `revealedAt` so React doesn't have to drive frame-by-frame.
 */
/** Tier-themed background + border colour for a flipped cushion. */
function cushionRevealStyle(tier: CushionReveal["tier"] | undefined): React.CSSProperties {
  switch (tier) {
    case "jackpot":
      return {
        background: "radial-gradient(circle at 50% 50%, var(--neon-gold) 0%, var(--gold-300) 70%)",
        border: "3px solid var(--gold-500)",
        boxShadow: "var(--glow-gold), inset 0 0 18px rgba(255, 232, 168, 0.6)",
      };
    case "high":
      return {
        background: "linear-gradient(180deg, var(--gold-100) 0%, var(--gold-300) 100%)",
        border: "3px solid var(--gold-500)",
        boxShadow: "inset 0 0 12px rgba(255, 220, 90, 0.5)",
      };
    case "mid":
      return {
        background: "linear-gradient(180deg, var(--sky-300) 0%, var(--sky-500) 100%)",
        border: "3px solid var(--ink-900)",
        boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.25)",
      };
    case "low":
      return {
        background: "var(--gold-100)",
        border: "3px solid var(--gold-300)",
      };
    case "lint":
      return {
        background: "var(--saddle-200)",
        border: "3px dashed var(--saddle-400)",
      };
    default:
      return { background: "var(--parchment-100)", border: "3px solid var(--ink-900)" };
  }
}

function CushionLootReveal({ reveal }: { reveal: CushionReveal }) {
  const filler = ["Lint", "Pennies", "Nickels", "Dimes", "Quarters", "Half-Dollars", "Dollars", "Jackpot!"];
  const labels = [...filler.filter((l) => l !== reveal.label), reveal.label];
  const finalIdx = labels.length - 1;
  const ROW = 22;
  const isJackpot = reveal.tier === "jackpot";
  const isHigh = reveal.tier === "high";
  const lintCushion = reveal.tier === "lint";
  return (
    <div style={{ width: "100%" }}>
      <div
        key={reveal.revealedAt}
        style={{
          position: "relative",
          height: ROW,
          overflow: "hidden",
          fontFamily: "var(--font-display)",
        }}
      >
        <div
          style={{
            ["--cushion-final" as string]: `-${finalIdx * ROW}px`,
            animation: "pp-cushion-spin 700ms cubic-bezier(.18, .82, .25, 1) forwards",
          }}
        >
          {labels.map((l, i) => (
            <div
              key={i}
              style={{
                height: ROW,
                lineHeight: `${ROW}px`,
                fontSize: i === finalIdx ? (isJackpot ? 17 : 15) : 13,
                fontWeight: i === finalIdx ? 700 : 400,
                textAlign: "center",
                color: i === finalIdx
                  ? (isJackpot ? "var(--ink-900)" : isHigh ? "var(--ink-900)" : reveal.pcGain > 0 ? "var(--ink-900)" : "var(--saddle-400)")
                  : "var(--saddle-400)",
                textShadow: i === finalIdx && isJackpot ? "1px 1px 0 var(--gold-100)" : undefined,
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </div>
      {reveal.pcGain > 0 ? (
        <div
          key={`pc-${reveal.revealedAt}`}
          style={{
            fontSize: isJackpot ? 18 : isHigh ? 16 : 14,
            color: isJackpot ? "var(--ink-900)" : "var(--gold-500)",
            fontWeight: isJackpot ? 700 : 600,
            opacity: 0,
            animation: "pp-cushion-pc-fade 300ms 700ms ease-out forwards",
            textAlign: "center",
            fontFamily: "var(--font-display)",
            textShadow: isJackpot ? "1px 1px 0 var(--gold-100)" : undefined,
            marginTop: 2,
          }}
        >
          +{reveal.pcGain.toLocaleString()} PC
        </div>
      ) : lintCushion ? (
        <div
          key={`lint-${reveal.revealedAt}`}
          style={{
            opacity: 0,
            animation: "pp-cushion-pc-fade 300ms 700ms ease-out forwards",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--saddle-400)" }}>nothing here…</div>
          {reveal.frugalityGained > 0 && (
            <div style={{ fontSize: 11, color: "var(--cactus-500)", fontFamily: "var(--font-display)" }}>
              +{reveal.frugalityGained} Frugality
            </div>
          )}
        </div>
      ) : (
        <div
          key={`nothing-${reveal.revealedAt}`}
          style={{
            fontSize: 11,
            color: "var(--saddle-400)",
            opacity: 0,
            animation: "pp-cushion-pc-fade 300ms 700ms ease-out forwards",
            textAlign: "center",
          }}
        >
          nothing
        </div>
      )}
      <style>{`
        @keyframes pp-cushion-spin {
          0%   { transform: translateY(0); }
          100% { transform: translateY(var(--cushion-final)); }
        }
        @keyframes pp-cushion-pc-fade {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Hand-drawn fountain sprite — basin, water arcs, a coin glinting
 *  in the pool. Used in place of the ⛲ emoji so the rare-event
 *  sprite reads as "drawn for this game" rather than a placeholder. */
function FountainSprite() {
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden>
      {/* Stone basin (bottom bowl) */}
      <ellipse cx="40" cy="62" rx="32" ry="9" fill="#3d2418" />
      <ellipse cx="40" cy="60" rx="30" ry="7" fill="#7a8a96" />
      <ellipse cx="40" cy="59" rx="28" ry="5.5" fill="#2c5a8a" />
      {/* Pool surface highlight */}
      <ellipse cx="34" cy="58" rx="10" ry="1.5" fill="rgba(255,255,255,0.45)" />
      {/* Coin glinting in the pool */}
      <circle cx="44" cy="59" r="2.2" fill="#f5c842" stroke="#1a0f08" strokeWidth="0.6" style={{ animation: "pp-fountain-glint 1.4s ease-in-out infinite" }} />
      {/* Pillar */}
      <rect x="36" y="38" width="8" height="20" fill="#7a8a96" stroke="#3d2418" strokeWidth="1.2" />
      <rect x="36" y="38" width="8" height="3" fill="#a8b8c4" />
      {/* Top dish */}
      <ellipse cx="40" cy="38" rx="14" ry="3.5" fill="#3d2418" />
      <ellipse cx="40" cy="36.5" rx="12" ry="2.5" fill="#7a8a96" />
      <ellipse cx="40" cy="36" rx="10.5" ry="1.6" fill="#2c5a8a" />
      {/* Water arcs spurting up */}
      <g style={{ transformOrigin: "40px 36px", animation: "pp-fountain-water 1.1s ease-in-out infinite" }}>
        <path d="M 40 34 Q 28 18 26 34" fill="none" stroke="#7ec8ef" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
        <path d="M 40 34 Q 52 18 54 34" fill="none" stroke="#7ec8ef" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
        <path d="M 40 32 L 40 12" stroke="#a8d8f0" strokeWidth="2.6" strokeLinecap="round" opacity="0.95" />
        <circle cx="40" cy="11" r="1.8" fill="#c8e8f8" />
      </g>
    </svg>
  );
}

/** Hand-drawn couch sprite — wood frame, two stitched cushions,
 *  legs, and a small dust mote rising from one cushion to telegraph
 *  "there's stuff in here." Replaces the flat brown-rectangle
 *  placeholder so the rare event reads as a real object. */
function CouchSprite() {
  return (
    <svg viewBox="0 0 112 72" width="100%" height="100%" aria-hidden>
      {/* Floor shadow */}
      <ellipse cx="56" cy="68" rx="48" ry="3" fill="rgba(0,0,0,0.35)" />
      {/* Wood frame back */}
      <rect x="6" y="14" width="100" height="42" rx="8" fill="#6b3f24" stroke="#1a0f08" strokeWidth="2.5" />
      <rect x="6" y="14" width="100" height="6" rx="3" fill="#8b5a2b" />
      {/* Side arms */}
      <rect x="4" y="22" width="14" height="34" rx="4" fill="#5a3220" stroke="#1a0f08" strokeWidth="2" />
      <rect x="94" y="22" width="14" height="34" rx="4" fill="#5a3220" stroke="#1a0f08" strokeWidth="2" />
      {/* Two cushions */}
      <g>
        <rect x="22" y="30" width="32" height="22" rx="4" fill="#c8884a" stroke="#1a0f08" strokeWidth="2" />
        <rect x="25" y="33" width="26" height="16" rx="3" fill="none" stroke="rgba(255,220,168,0.55)" strokeWidth="1" strokeDasharray="2 2" />
      </g>
      <g>
        <rect x="58" y="30" width="32" height="22" rx="4" fill="#c8884a" stroke="#1a0f08" strokeWidth="2" />
        <rect x="61" y="33" width="26" height="16" rx="3" fill="none" stroke="rgba(255,220,168,0.55)" strokeWidth="1" strokeDasharray="2 2" />
      </g>
      {/* Legs */}
      <rect x="10" y="56" width="6" height="8" fill="#3d2418" />
      <rect x="96" y="56" width="6" height="8" fill="#3d2418" />
      {/* Dust mote rising from the right cushion — animates upward */}
      <circle cx="74" cy="32" r="1.6" fill="#fef6e4" opacity="0.7" style={{ animation: "pp-couch-mote 2s ease-out infinite" }} />
      <circle cx="38" cy="32" r="1.2" fill="#fef6e4" opacity="0.6" style={{ animation: "pp-couch-mote 2s ease-out 0.7s infinite" }} />
      {/* Tiny "DIVE" tag chip pinned to the back, top-centre */}
      <rect x="44" y="9" width="24" height="11" rx="2" fill="#f5c842" stroke="#1a0f08" strokeWidth="1.4" />
      <text x="56" y="17" textAnchor="middle" fontFamily="M6X11, monospace" fontSize="7" fill="#1a0f08" letterSpacing="1">
        DIVE!
      </text>
    </svg>
  );
}

/** Render a buy-rejection code as a player-facing string. The
 *  engine returns these from applyBuyUpgrade when a buy is invalid
 *  (which, since the client gates affordability locally, only
 *  happens on weird edge cases like a torn-state race). */
function labelForUpgradeError(code: string | undefined | null): string {
  switch (code) {
    case "insufficient_cents": return "Not enough PC for this upgrade.";
    case "max_level":          return "This upgrade is already at max level.";
    case "bad_upgrade":        return "Unknown upgrade.";
    default:                   return "Couldn't buy that upgrade. Try again.";
  }
}

/** Save-status chip — autosave countdown + transient Saved / Failed
 *  states. Sits in the right-column stack under the Bank It panel.
 *  Gives the player a visible signal that their progress is being
 *  persisted across devices, even though every action feels instant. */
function SaveChip({
  countdown,
  status,
  lastSavedAt,
}: {
  countdown: number;
  status: "idle" | "saving" | "saved" | "failed";
  lastSavedAt: string | null;
}) {
  const failed = status === "failed";
  const saved = status === "saved";
  const saving = status === "saving";
  const accent = failed
    ? "var(--crimson-500)"
    : saved
    ? "var(--cactus-500)"
    : saving
    ? "var(--gold-500)"
    : "var(--saddle-300)";
  const bg = failed
    ? "rgba(180, 60, 60, 0.12)"
    : saved
    ? "rgba(60, 130, 70, 0.14)"
    : "var(--parchment-200)";
  const label = failed
    ? "Save failed — retrying"
    : saved
    ? "Saved"
    : saving
    ? "Saving…"
    : `Saves in ${countdown}s`;
  const lastSavedText = (() => {
    if (!lastSavedAt) return "Not yet saved";
    try {
      const dt = new Date(lastSavedAt);
      const mins = Math.floor((Date.now() - dt.getTime()) / 60000);
      if (mins < 1) return "Saved seconds ago";
      if (mins === 1) return "Saved 1 min ago";
      if (mins < 60) return `Saved ${mins} min ago`;
      const hrs = Math.floor(mins / 60);
      return hrs === 1 ? "Saved 1 hr ago" : `Saved ${hrs} hr ago`;
    } catch { return "Saved recently"; }
  })();
  return (
    <div
      style={{
        padding: "6px 10px",
        background: bg,
        border: `2px solid ${accent}`,
        fontFamily: "var(--font-display)",
        color: "var(--ink-900)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        transition: "background 200ms, border-color 200ms",
        animation: saved ? "pp-save-pulse 1.5s ease-out" : undefined,
      }}
      title={lastSavedText}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: accent,
          boxShadow: saved ? `0 0 8px ${accent}` : undefined,
          animation: saving ? "pp-save-blink 0.9s ease-in-out infinite" : undefined,
        }}
      />
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: accent,
          flex: 1,
        }}
      >
        Autosave
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-900)" }}>{label}</span>
      <style>{`
        @keyframes pp-save-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(95, 161, 122, 0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(95, 161, 122, 0); }
          100% { box-shadow: 0 0 0 0 rgba(95, 161, 122, 0); }
        }
        @keyframes pp-save-blink {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

