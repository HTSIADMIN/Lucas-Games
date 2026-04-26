"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GameIcon } from "@/components/GameIcon";
import {
  CLAN_ANIMALS,
  CLAN_FOUNDING_FEE,
  CLAN_MAX_MEMBERS,
  CHEST_TIER_LABEL,
  CHEST_TIER_COLOR,
} from "@/lib/clans/constants";
import type {
  Clan,
  ClanAnimal,
  ClanChest,
  ClanChestRewards,
  ClanChestTier,
  ClanMember,
  ClanSeason,
} from "@/lib/db";

type ApiState = {
  enabled: boolean;
  season?: ClanSeason | null;
  myClan?: Clan | null;
  myMembership?: ClanMember | null;
  members?: (ClanMember & { username?: string; avatar_color?: string; initials?: string })[] | null;
  leaderboard?: Clan[];
  chests?: ClanChest[];
};

export function ClansClient({ meId }: { meId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ApiState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [openingChest, setOpeningChest] = useState<ClanChest | null>(null);
  const [openedRewards, setOpenedRewards] = useState<ClanChestRewards | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/clans", { cache: "no-store" });
      const d = await r.json();
      setState(d);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  if (!state) {
    return <p className="text-mute">Loading clans...</p>;
  }
  if (!state.enabled) {
    return (
      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <p className="text-mute">Clans require the cloud database. Locally unavailable.</p>
      </div>
    );
  }

  const myClan = state.myClan ?? null;
  const isLeader = state.myMembership?.role === "leader";
  const chests = state.chests ?? [];

  return (
    <>
      <style>{CLAN_KEYFRAMES}</style>

      {/* Pending chests banner */}
      {chests.length > 0 && (
        <div
          className="panel"
          style={{
            padding: "var(--sp-4)",
            marginBottom: "var(--sp-4)",
            background: "var(--gold-100)",
            border: "3px solid var(--ink-900)",
            boxShadow: "var(--glow-gold)",
            animation: "clan-pulse 1.6s ease-in-out infinite alternate",
          }}
        >
          <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)", color: "var(--gold-700)" }}>
                {chests.length} chest{chests.length === 1 ? "" : "s"} to open!
              </div>
              <p className="text-mute" style={{ fontSize: 13, marginTop: 2 }}>
                Last week's clan rewards are waiting.
              </p>
            </div>
            <button className="btn btn-lg" onClick={() => setOpeningChest(chests[0])}>
              Open the first chest
            </button>
          </div>
        </div>
      )}

      {/* Main grid: my-clan dashboard | leaderboard */}
      <div className="grid grid-2" style={{ gap: "var(--sp-4)", alignItems: "start" }}>
        {myClan ? (
          <ClanDashboard
            clan={myClan}
            members={state.members ?? []}
            isLeader={isLeader}
            meId={meId}
            busy={busy}
            onLeave={async () => {
              if (!confirm("Leave the clan? Weekly XP stays with the clan.")) return;
              setBusy(true);
              await fetch("/api/clans/leave", { method: "POST" });
              await refresh();
              router.refresh();
              setBusy(false);
            }}
          />
        ) : (
          <NoClanPanel
            onCreate={() => setShowCreate(true)}
          />
        )}

        <Leaderboard clans={state.leaderboard ?? []} myClanId={myClan?.id ?? null} />
      </div>

      {/* All clans grid (joinable) */}
      {!myClan && (state.leaderboard?.length ?? 0) > 0 && (
        <div className="panel" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-4)" }}>
          <div className="panel-title">Browse Clans</div>
          <div className="grid grid-3" style={{ gap: "var(--sp-3)" }}>
            {state.leaderboard!.map((c) => (
              <ClanCard
                key={c.id}
                clan={c}
                joinable={c.member_count < CLAN_MAX_MEMBERS}
                onJoin={async () => {
                  setBusy(true);
                  setError(null);
                  const res = await fetch("/api/clans/join", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ clanId: c.id }),
                  });
                  const data = await res.json();
                  setBusy(false);
                  if (!res.ok) {
                    setError(labelFor(data.error ?? "error"));
                    return;
                  }
                  await refresh();
                  router.refresh();
                }}
                disabled={busy}
              />
            ))}
          </div>
          {error && <p style={{ color: "var(--crimson-500)", marginTop: 8 }}>{error}</p>}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateClanModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
            router.refresh();
          }}
        />
      )}

      {/* Chest opening overlay */}
      {openingChest && (
        <ChestOpeningOverlay
          chest={openingChest}
          rewards={openedRewards}
          onOpen={async () => {
            const r = await fetch(`/api/clans/chests/${openingChest.id}/open`, { method: "POST" });
            const d = await r.json();
            if (r.ok && d.chest?.rewards) {
              setOpenedRewards(d.chest.rewards);
            }
          }}
          onDone={async () => {
            setOpeningChest(null);
            setOpenedRewards(null);
            await refresh();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// ============================================================
// Sub-components
// ============================================================

function NoClanPanel({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="panel-title">Ride solo</div>
      <p className="text-mute" style={{ marginBottom: "var(--sp-4)" }}>
        You're not in a clan. Found one for {CLAN_FOUNDING_FEE.toLocaleString()}¢ or join one
        from the list. Up to {CLAN_MAX_MEMBERS} members.
      </p>
      <button className="btn btn-lg btn-block" onClick={onCreate}>
        Found a Clan ({CLAN_FOUNDING_FEE.toLocaleString()}¢)
      </button>
      <p className="text-mute" style={{ fontSize: 12, marginTop: "var(--sp-3)" }}>
        Pick a name, a tag, an animal. Top clans win chests every week with
        coins, monopoly cards, and bonus spins.
      </p>
    </div>
  );
}

function ClanDashboard({
  clan,
  members,
  isLeader,
  meId,
  busy,
  onLeave,
}: {
  clan: Clan;
  members: (ClanMember & { username?: string; avatar_color?: string; initials?: string })[];
  isLeader: boolean;
  meId: string;
  busy: boolean;
  onLeave: () => void;
}) {
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="row" style={{ gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
        <ClanCrest animal={clan.animal_icon} size={56} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)" }}>
            {clan.name} <span className="text-mute" style={{ fontSize: 14 }}>[{clan.tag}]</span>
          </div>
          <div className="text-mute" style={{ fontSize: 13 }}>
            {clan.member_count} / {CLAN_MAX_MEMBERS} riders · {clan.total_xp_week.toLocaleString()} XP this week
          </div>
        </div>
        {isLeader && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-display)",
              fontSize: 12,
              background: "var(--gold-300)",
              color: "var(--ink-900)",
              padding: "2px 8px",
              border: "2px solid var(--ink-900)",
              letterSpacing: "var(--ls-loose)",
            }}
          >
            LEADER
          </span>
        )}
      </div>

      <div className="divider" style={{ margin: "var(--sp-3) 0" }}>Members</div>

      <div className="stack" style={{ gap: 0 }}>
        {members.map((m) => {
          const isMe = m.user_id === meId;
          return (
            <div
              key={m.user_id}
              className="between"
              style={{
                padding: "var(--sp-2) 0",
                borderBottom: "2px dashed var(--saddle-300)",
                fontFamily: "var(--font-display)",
              }}
            >
              <div className="row" style={{ gap: 8 }}>
                <span
                  className="avatar avatar-sm"
                  style={{
                    background: m.avatar_color ?? "var(--gold-300)",
                    fontSize: 11,
                    width: 28,
                    height: 28,
                    borderWidth: 2,
                  }}
                >
                  {m.initials ?? "??"}
                </span>
                <div>
                  <div style={{ fontSize: 14 }}>
                    {m.username ?? "?"}
                    {isMe && <span className="tag-new" style={{ marginLeft: 6 }}>YOU</span>}
                    {m.role === "leader" && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--gold-500)" }}>★</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-money" style={{ fontSize: 14 }}>
                {Number(m.weekly_xp).toLocaleString()} XP
              </span>
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-ghost btn-block"
        onClick={onLeave}
        disabled={busy}
        style={{ marginTop: "var(--sp-4)" }}
      >
        {isLeader && clan.member_count > 1 ? "Leave (passes leadership)" : "Leave Clan"}
      </button>
    </div>
  );
}

function Leaderboard({ clans, myClanId }: { clans: Clan[]; myClanId: string | null }) {
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="panel-title">Weekly Standings</div>
      {clans.length === 0 ? (
        <p className="text-mute">No clans yet. Be first.</p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {clans.slice(0, 12).map((c, i) => {
            const rank = i + 1;
            const isMine = c.id === myClanId;
            const tone =
              rank === 1 ? { bg: "var(--gold-100)", fg: "var(--gold-700)", crown: true } :
              rank <= 3 ? { bg: "var(--parchment-200)", fg: "var(--saddle-500)", crown: false } :
              { bg: "var(--parchment-100)", fg: "var(--saddle-400)", crown: false };
            return (
              <div
                key={c.id}
                className="between"
                style={{
                  padding: "var(--sp-2) var(--sp-3)",
                  background: isMine ? "var(--gold-100)" : tone.bg,
                  borderBottom: "2px dashed var(--saddle-300)",
                  fontFamily: "var(--font-display)",
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ width: 28, textAlign: "center", fontSize: 16, color: tone.fg }}>
                    {tone.crown ? "★" : rank}
                  </span>
                  <ClanCrest animal={c.animal_icon} size={28} />
                  <div>
                    <div style={{ fontSize: 14 }}>
                      {c.name} <span className="text-mute" style={{ fontSize: 11 }}>[{c.tag}]</span>
                      {isMine && <span className="tag-new" style={{ marginLeft: 6 }}>YOURS</span>}
                    </div>
                    <div className="text-mute" style={{ fontSize: 11 }}>
                      {c.member_count} member{c.member_count === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span className="text-money" style={{ fontSize: 13 }}>
                  {Number(c.total_xp_week).toLocaleString()} XP
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: "var(--sp-3)", fontSize: 12 }} className="text-mute">
        Top 10 clans win chests at the weekly reset. Rank 1 = Legendary, 2-3 = Epic, 4-10 = Rare.
      </div>
    </div>
  );
}

function ClanCard({
  clan,
  joinable,
  onJoin,
  disabled,
}: {
  clan: Clan;
  joinable: boolean;
  onJoin: () => void;
  disabled: boolean;
}) {
  return (
    <div className="panel" style={{ padding: "var(--sp-3)" }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
        <ClanCrest animal={clan.animal_icon} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.1 }}>
            {clan.name}
          </div>
          <div className="text-mute" style={{ fontSize: 12 }}>
            [{clan.tag}] · {clan.member_count}/{CLAN_MAX_MEMBERS}
          </div>
        </div>
      </div>
      <div className="text-money" style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>
        {Number(clan.total_xp_week).toLocaleString()} XP
      </div>
      <button
        className="btn btn-block btn-sm"
        onClick={onJoin}
        disabled={disabled || !joinable}
        style={{ marginTop: 8 }}
      >
        {joinable ? "Join" : "Full"}
      </button>
    </div>
  );
}

function CreateClanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [animalIcon, setAnimalIcon] = useState<ClanAnimal>("wolf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/clans/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, tag, animalIcon }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(labelFor(d.error ?? "error"));
      return;
    }
    onCreated();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.78)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{
          width: "min(560px, 100%)",
          padding: "var(--sp-5)",
          background: "var(--parchment-100)",
          border: "4px solid var(--ink-900)",
        }}
      >
        <div className="panel-title">Found a Clan</div>
        <div className="stack-lg">
          <div>
            <label className="label">Name (2-20 chars)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="The Black Dust Riders"
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label className="label">Tag (2-4 chars)</label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="BDR"
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label className="label">Animal</label>
            <div className="grid grid-4" style={{ gap: 6 }}>
              {CLAN_ANIMALS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAnimalIcon(a.key)}
                  style={{
                    background: animalIcon === a.key ? "var(--gold-300)" : "var(--parchment-50)",
                    border: animalIcon === a.key ? "3px solid var(--ink-900)" : "2px solid var(--saddle-300)",
                    padding: "var(--sp-2)",
                    cursor: "pointer",
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    letterSpacing: "var(--ls-loose)",
                    textTransform: "uppercase",
                    boxShadow: animalIcon === a.key ? "var(--glow-gold)" : undefined,
                  }}
                >
                  <ClanCrest animal={a.key} size={48} />
                  <div>{a.name}</div>
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-lg btn-block" onClick={go} disabled={busy || !name || !tag}>
            {busy ? "..." : `Found (${CLAN_FOUNDING_FEE.toLocaleString()}¢)`}
          </button>
          {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
          <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ClanCrest({ animal, size }: { animal: ClanAnimal; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "var(--saddle-500)",
        border: "3px solid var(--ink-900)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "var(--bevel-light)",
        flexShrink: 0,
      }}
    >
      <GameIcon name={`clan.${animal}` as `clan.${ClanAnimal}`} size={Math.floor(size * 0.85)} />
    </div>
  );
}

// ============================================================
// Chest opening overlay
// ============================================================
function ChestOpeningOverlay({
  chest,
  rewards,
  onOpen,
  onDone,
}: {
  chest: ClanChest;
  rewards: ClanChestRewards | null;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const tone = CHEST_TIER_COLOR[chest.tier];
  const isLegendary = chest.tier === "legendary";

  async function go() {
    if (opened) return;
    setOpened(true);
    await onOpen();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.86)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(540px, 100%)",
          padding: "var(--sp-5)",
          background: "var(--parchment-100)",
          border: "5px solid var(--ink-900)",
          boxShadow: `0 0 60px ${tone.glow}`,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h2)",
            color: tone.bg,
            textShadow: "2px 2px 0 var(--ink-900)",
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
            animation: isLegendary ? "clan-pulse 1.4s ease-in-out infinite alternate" : undefined,
          }}
        >
          {CHEST_TIER_LABEL[chest.tier]}
        </div>
        <p className="text-mute" style={{ marginTop: 4, marginBottom: "var(--sp-4)" }}>
          Rank {chest.rank} · {new Date(chest.created_at).toLocaleDateString()}
        </p>

        <div
          style={{
            position: "relative",
            display: "inline-block",
            margin: "var(--sp-3) 0 var(--sp-5)",
          }}
        >
          <ChestSprite tier={chest.tier} opened={opened && !!rewards} />
        </div>

        {rewards ? (
          <RewardSummary rewards={rewards} />
        ) : opened ? (
          <p className="text-mute">Opening...</p>
        ) : (
          <button
            className="btn btn-lg btn-block"
            onClick={go}
            style={{
              background: tone.bg,
              color: tone.fg,
              border: "3px solid var(--ink-900)",
              boxShadow: `var(--bevel-light), 0 0 20px ${tone.glow}`,
            }}
          >
            OPEN
          </button>
        )}

        {rewards && (
          <button className="btn btn-block" onClick={onDone} style={{ marginTop: "var(--sp-3)" }}>
            Collect & Continue
          </button>
        )}

        {/* Confetti */}
        {opened && rewards && <ChestConfetti tier={chest.tier} />}
      </div>
    </div>
  );
}

function ChestSprite({ tier, opened }: { tier: ClanChestTier; opened: boolean }) {
  const tone = CHEST_TIER_COLOR[tier];
  return (
    <div
      style={{
        position: "relative",
        width: 160,
        height: 130,
        animation: opened ? "chest-burst 0.6s var(--ease-snap) forwards" : "chest-shake 1.6s ease-in-out infinite",
      }}
    >
      {/* Lid */}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 0,
          width: 144,
          height: 40,
          background: tone.bg,
          border: `4px solid ${tone.ring}`,
          borderRadius: "20px 20px 0 0",
          boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.3), inset 0 4px 0 rgba(255,255,255,0.25)`,
          transformOrigin: "0 100%",
          animation: opened ? "chest-lid 0.6s var(--ease-snap) forwards" : undefined,
          zIndex: 3,
        }}
      />
      {/* Body */}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 32,
          width: 144,
          height: 90,
          background: tone.bg,
          border: `4px solid ${tone.ring}`,
          boxShadow: `inset 0 -6px 0 rgba(0,0,0,0.35), inset 0 4px 0 rgba(255,255,255,0.2)`,
          zIndex: 2,
        }}
      />
      {/* Lock */}
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 30,
          width: 22,
          height: 22,
          background: "var(--gold-300)",
          border: "3px solid var(--ink-900)",
          zIndex: 4,
        }}
      />
      {/* Inner glow once opened */}
      {opened && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 50% 60%, ${tone.glow}, transparent 65%)`,
            zIndex: 1,
            animation: "chest-glow 1s ease-in-out forwards",
          }}
        />
      )}
    </div>
  );
}

function RewardSummary({ rewards }: { rewards: ClanChestRewards }) {
  return (
    <div className="stack" style={{ gap: "var(--sp-3)", margin: "var(--sp-4) 0" }}>
      {rewards.coins != null && rewards.coins > 0 && (
        <RewardLine label="Cash" value={`+${rewards.coins.toLocaleString()} ¢`} icon="slot.gold" />
      )}
      {rewards.spinTokens != null && rewards.spinTokens > 0 && (
        <RewardLine
          label="Bonus Daily Spin"
          value={`x${rewards.spinTokens}`}
          icon="ui.crown"
        />
      )}
      {rewards.monopolyCards && rewards.monopolyCards.length > 0 && (
        <RewardLine
          label="Monopoly Cards"
          value={rewards.monopolyCards
            .map((c) => `${c.count}× ${c.propertyId.replace(/_/g, " ")}`)
            .join(", ")}
          icon="lobby.monopoly"
        />
      )}
    </div>
  );
}

function RewardLine({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div
      className="between"
      style={{
        padding: "var(--sp-2) var(--sp-3)",
        background: "var(--parchment-200)",
        border: "3px solid var(--ink-900)",
        animation: "reward-in 0.45s var(--ease-snap) backwards",
      }}
    >
      <div className="row" style={{ gap: 10 }}>
        <GameIcon name={icon as Parameters<typeof GameIcon>[0]["name"]} size={28} />
        <span style={{ fontFamily: "var(--font-display)" }}>{label}</span>
      </div>
      <span className="text-money" style={{ fontFamily: "var(--font-display)" }}>{value}</span>
    </div>
  );
}

function ChestConfetti({ tier }: { tier: ClanChestTier }) {
  const tone = CHEST_TIER_COLOR[tier];
  const count = tier === "legendary" ? 60 : tier === "epic" ? 40 : 24;
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: 0.1 + Math.random() * 0.4,
    duration: 1.4 + Math.random() * 1.0,
    size: 10 + Math.random() * 12,
    rotate: Math.random() * 360,
    color: i % 3 === 0 ? "#f5c842" : i % 3 === 1 ? tone.bg : "#ffd84d",
  }));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.size,
            background: p.color,
            border: "2px solid var(--ink-900)",
            borderRadius: 999,
            animation: `chest-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function labelFor(code: string) {
  const m: Record<string, string> = {
    insufficient_funds: `Need at least ${CLAN_FOUNDING_FEE.toLocaleString()}¢ to found a clan.`,
    name_invalid: "Name must be 2-20 characters.",
    tag_invalid: "Tag must be 2-4 characters.",
    animal_invalid: "Pick an animal.",
    name_taken: "That name's already taken.",
    already_in_a_clan: "You're already in a clan.",
    clan_full: "That clan is full.",
    clan_not_found: "Clan not found.",
  };
  return m[code] ?? "Something went wrong.";
}

const CLAN_KEYFRAMES = `
@keyframes clan-pulse {
  0%, 100% { transform: scale(1); }
  100%     { transform: scale(1.02); }
}
@keyframes chest-shake {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  25%      { transform: rotate(-2deg) translateY(-3px); }
  50%      { transform: rotate(0deg)  translateY(-6px); }
  75%      { transform: rotate(2deg)  translateY(-3px); }
}
@keyframes chest-lid {
  0%   { transform: rotate(0); }
  60%  { transform: rotate(-95deg); }
  100% { transform: rotate(-110deg); }
}
@keyframes chest-burst {
  0%   { transform: scale(1) translateY(0); }
  35%  { transform: scale(1.15) translateY(-10px); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes chest-glow {
  0%   { opacity: 0; }
  30%  { opacity: 1; }
  100% { opacity: 0.55; }
}
@keyframes chest-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(620px) rotate(720deg); opacity: 0; }
}
@keyframes reward-in {
  0%   { transform: translateY(20px) scale(0.92); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
`;
