"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameIcon } from "@/components/GameIcon";
import { Avatar } from "@/components/Avatar";
import { ProfileModal } from "@/components/social/ProfileModal";
import {
  CARD_TIER_LABEL,
  CARD_TIER_WEIGHTS,
  CHEST_LOOT_PREVIEW,
  CHEST_TIER_COLOR,
  CHEST_TIER_LABEL,
  CLAN_ANIMALS,
  CLAN_EMBLEMS,
  CLAN_EMBLEM_FILE,
  CLAN_FOUNDING_FEE,
  CLAN_MAX_MEMBERS,
} from "@/lib/clans/constants";
import type {
  Clan,
  ClanAnimal,
  ClanChatMessagePublic,
  ClanChest,
  ClanChestRewards,
  ClanChestTier,
  ClanInvite,
  ClanMember,
  ClanSeason,
} from "@/lib/db";

type EnrichedMember = ClanMember & {
  username?: string;
  avatar_color?: string;
  initials?: string;
  equipped_frame?: string | null;
  equipped_hat?: string | null;
};

type EnrichedInvite = ClanInvite & { clan?: Clan; inviter_username?: string };
type ClanInviteOut = ClanInvite & { invitee_username?: string };

type HistoryEntry = { season_id: string; week_start: string; rank: number; total_xp: number };

type ApiState = {
  enabled: boolean;
  season?: ClanSeason | null;
  myClan?: Clan | null;
  myMembership?: ClanMember | null;
  members?: EnrichedMember[] | null;
  leaderboard?: Clan[];
  chests?: ClanChest[];
  myInvites?: EnrichedInvite[];
  chat?: ClanChatMessagePublic[] | null;
  history?: HistoryEntry[] | null;
  pendingInvites?: ClanInviteOut[] | null;
};

export function ClansClient({ meId }: { meId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ApiState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [openingChest, setOpeningChest] = useState<ClanChest | null>(null);
  const [openedRewards, setOpenedRewards] = useState<ClanChestRewards | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

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
    const t = setInterval(refresh, 6000);
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
  const myInvites = state.myInvites ?? [];

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

      {/* My pending invites */}
      {myInvites.length > 0 && (
        <div
          className="panel"
          style={{
            padding: "var(--sp-4)",
            marginBottom: "var(--sp-4)",
            background: "var(--cactus-100)",
            border: "3px solid var(--ink-900)",
          }}
        >
          <div className="panel-title" style={{ fontSize: "var(--fs-h4)" }}>
            Invites for you ({myInvites.length})
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {myInvites.map((inv) => (
              <div
                key={inv.id}
                className="between"
                style={{
                  padding: "var(--sp-3)",
                  background: "var(--parchment-100)",
                  border: "2px solid var(--ink-900)",
                  flexWrap: "wrap",
                  gap: "var(--sp-2)",
                }}
              >
                <div className="row" style={{ gap: 10 }}>
                  {inv.clan && <ClanCrest animal={inv.clan.animal_icon} size={36} />}
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>
                      {inv.clan?.name ?? "?"}{" "}
                      <span className="text-mute" style={{ fontSize: 12 }}>
                        [{inv.clan?.tag ?? "?"}]
                      </span>
                    </div>
                    <div className="text-mute" style={{ fontSize: 12 }}>
                      Invited by {inv.inviter_username ?? "?"}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true); setError(null);
                      const r = await fetch(`/api/clans/invites/${inv.id}`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "accept" }),
                      });
                      const d = await r.json();
                      setBusy(false);
                      if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
                      await refresh();
                      router.refresh();
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await fetch(`/api/clans/invites/${inv.id}`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "decline" }),
                      });
                      setBusy(false);
                      await refresh();
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
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
            onPickMember={(uid) => setProfileUserId(uid)}
            onLeave={async () => {
              if (!confirm("Leave the clan? Weekly XP stays with the clan.")) return;
              setBusy(true);
              await fetch("/api/clans/leave", { method: "POST" });
              await refresh();
              router.refresh();
              setBusy(false);
            }}
            onKick={async (userId, name) => {
              if (!confirm(`Kick ${name}? They lose their seat in the clan.`)) return;
              setBusy(true); setError(null);
              const r = await fetch(`/api/clans/${myClan.id}/kick`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ userId }),
              });
              const d = await r.json();
              setBusy(false);
              if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
              await refresh();
            }}
            onOpenSettings={() => setShowSettings(true)}
            onOpenInvite={() => setShowInvite(true)}
            pendingInvites={state.pendingInvites ?? []}
          />
        ) : (
          <NoClanPanel onCreate={() => setShowCreate(true)} />
        )}

        <Leaderboard clans={state.leaderboard ?? []} myClanId={myClan?.id ?? null} />
      </div>

      {/* In-clan chat + history when in a clan */}
      {myClan && (
        <div className="grid grid-2" style={{ gap: "var(--sp-4)", marginTop: "var(--sp-4)", alignItems: "start" }}>
          <ClanChat
            clanId={myClan.id}
            messages={state.chat ?? []}
            meId={meId}
            onSent={refresh}
          />
          <ClanHistory entries={state.history ?? []} />
        </div>
      )}

      {/* All clans grid (joinable) */}
      {!myClan && (state.leaderboard?.length ?? 0) > 0 && (
        <div className="panel" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-4)" }}>
          <div className="panel-title">Browse Clans</div>
          <div className="grid grid-3" style={{ gap: "var(--sp-3)" }}>
            {state.leaderboard!.map((c) => (
              <ClanCard
                key={c.id}
                clan={c}
                joinable={c.member_count < CLAN_MAX_MEMBERS && !c.invite_only}
                inviteOnly={!!c.invite_only}
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

      {/* Always-visible chest loot preview */}
      <ChestLootPreview />

      {/* Modals */}
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
      {showSettings && myClan && (
        <SettingsModal
          clan={myClan}
          onClose={() => setShowSettings(false)}
          onSaved={async () => {
            setShowSettings(false);
            await refresh();
          }}
        />
      )}
      {showInvite && myClan && (
        <InviteModal
          clanId={myClan.id}
          pending={state.pendingInvites ?? []}
          onClose={() => setShowInvite(false)}
          onSent={refresh}
        />
      )}
      {profileUserId && (
        <ProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
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
// No-clan panel
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
        Top clans win chests every week with coins, monopoly cards, and bonus spins.
      </p>
    </div>
  );
}

// ============================================================
// Clan dashboard (leader controls + members list + kick)
// ============================================================
function ClanDashboard({
  clan,
  members,
  isLeader,
  meId,
  busy,
  onPickMember,
  onLeave,
  onKick,
  onOpenSettings,
  onOpenInvite,
  pendingInvites,
}: {
  clan: Clan;
  members: EnrichedMember[];
  isLeader: boolean;
  meId: string;
  busy: boolean;
  onPickMember: (userId: string) => void;
  onLeave: () => void;
  onKick: (userId: string, name: string) => void;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
  pendingInvites: ClanInviteOut[];
}) {
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="row" style={{ gap: "var(--sp-3)", marginBottom: "var(--sp-3)", alignItems: "center" }}>
        <ClanCrest animal={clan.animal_icon} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>{clan.name}</span>
            <span className="text-mute" style={{ fontSize: 14 }}>[{clan.tag}]</span>
            {clan.invite_only && (
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  background: "var(--saddle-500)",
                  color: "var(--gold-300)",
                  padding: "2px 6px",
                  border: "2px solid var(--ink-900)",
                  letterSpacing: "var(--ls-loose)",
                }}
              >
                INVITE ONLY
              </span>
            )}
          </div>
          <div className="text-mute" style={{ fontSize: 13 }}>
            {clan.member_count} / {CLAN_MAX_MEMBERS} riders · {clan.total_xp_week.toLocaleString()} XP this week
          </div>
        </div>
        {isLeader && (
          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onOpenInvite}
              title="Invite a player"
            >
              Invite
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onOpenSettings}
              title="Clan settings"
            >
              ⚙ Settings
            </button>
          </div>
        )}
      </div>

      {pendingInvites.length > 0 && (
        <div
          style={{
            background: "var(--saddle-500)",
            color: "var(--parchment-50)",
            border: "2px solid var(--ink-900)",
            padding: "var(--sp-2) var(--sp-3)",
            fontSize: 12,
            marginBottom: "var(--sp-3)",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", color: "var(--gold-300)", marginRight: 6 }}>
            Pending invites:
          </span>
          {pendingInvites.map((p) => p.invitee_username ?? "?").join(", ")}
        </div>
      )}

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
              <button
                type="button"
                onClick={() => onPickMember(m.user_id)}
                style={{
                  background: "transparent",
                  border: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  color: "inherit",
                  fontFamily: "inherit",
                  textAlign: "left",
                  padding: 0,
                }}
                title="View profile"
              >
                <Avatar
                  initials={m.initials ?? "??"}
                  color={m.avatar_color ?? "var(--gold-300)"}
                  size={28}
                  fontSize={11}
                  frame={m.equipped_frame ?? null}
                  hat={m.equipped_hat ?? null}
                />
                <div>
                  <div style={{ fontSize: 14 }}>
                    {m.username ?? "?"}
                    {isMe && <span className="tag-new" style={{ marginLeft: 6 }}>YOU</span>}
                    {m.role === "leader" && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--gold-500)" }}>★</span>
                    )}
                  </div>
                </div>
              </button>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <div style={{ textAlign: "right", fontFamily: "var(--font-display)" }}>
                  <div className="text-money" style={{ fontSize: 14 }}>
                    {Number(m.weekly_xp).toLocaleString()} XP
                  </div>
                  <div className="text-mute" style={{ fontSize: 10, letterSpacing: "0.04em" }}>
                    {memberContribution(m, members)} · {relativeLastActive(m.last_active_at)}
                  </div>
                </div>
                {isLeader && !isMe && m.role !== "leader" && (
                  <button
                    type="button"
                    onClick={() => onKick(m.user_id, m.username ?? "this rider")}
                    disabled={busy}
                    title="Kick from clan"
                    style={{
                      background: "var(--crimson-500)",
                      color: "var(--parchment-50)",
                      border: "2px solid var(--ink-900)",
                      padding: "1px 6px",
                      fontFamily: "var(--font-display)",
                      fontSize: 10,
                      cursor: "pointer",
                      letterSpacing: "var(--ls-loose)",
                    }}
                  >
                    KICK
                  </button>
                )}
              </div>
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

// ============================================================
// Leaderboard
// ============================================================
function Leaderboard({ clans, myClanId }: { clans: Clan[]; myClanId: string | null }) {
  const [inspecting, setInspecting] = useState<string | null>(null);
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
              <button
                key={c.id}
                type="button"
                onClick={() => setInspecting(c.id)}
                title="View clan members"
                className="between"
                style={{
                  width: "100%",
                  padding: "var(--sp-2) var(--sp-3)",
                  background: isMine ? "var(--gold-100)" : tone.bg,
                  borderBottom: "2px dashed var(--saddle-300)",
                  borderTop: 0,
                  borderLeft: 0,
                  borderRight: 0,
                  fontFamily: "var(--font-display)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ width: 28, textAlign: "center", fontSize: 16, color: tone.fg }}>
                    {tone.crown ? "★" : rank}
                  </span>
                  <ClanCrest animal={c.animal_icon} size={28} />
                  <div>
                    <div style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                      {c.name}
                      <span className="text-mute" style={{ fontSize: 11 }}>[{c.tag}]</span>
                      {c.invite_only && (
                        <span style={{ fontSize: 10, color: "var(--saddle-400)" }} title="Invite only">🔒</span>
                      )}
                      {isMine && <span className="tag-new" style={{ marginLeft: 4 }}>YOURS</span>}
                    </div>
                    <div className="text-mute" style={{ fontSize: 11 }}>
                      {c.member_count} member{c.member_count === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span className="text-money" style={{ fontSize: 13 }}>
                  {Number(c.total_xp_week).toLocaleString()} XP
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: "var(--sp-3)", fontSize: 12 }} className="text-mute">
        Tap a clan to see its members. Top 10 clans win chests at the weekly reset. Rank 1 = Legendary, 2-3 = Epic, 4-10 = Rare.
      </div>
      {inspecting && (
        <ClanDetailModal clanId={inspecting} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}

// ============================================================
// Public clan detail modal — opens from any leaderboard row, fetches
// the target clan's roster via /api/clans/[id], and shows each
// member's contribution share + last-active. Read-only; no kick or
// invite controls (those still live inside your own clan view).
// ============================================================
function ClanDetailModal({ clanId, onClose }: { clanId: string; onClose: () => void }) {
  const [clan, setClan] = useState<Clan | null>(null);
  const [members, setMembers] = useState<EnrichedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/clans/${clanId}`);
        const d = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          clan?: Clan;
          members?: EnrichedMember[];
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok || !d.clan) {
          setErr(d.error ?? `Couldn't load (${r.status})`);
        } else {
          setClan(d.clan);
          setMembers(d.members ?? []);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clanId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,15,8,0.78)",
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood"
        style={{
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
          // Force every nested text node to inherit parchment so
          // the dark wood background stays readable. Individual
          // inline `color` styles below still override per-element
          // (gold-300 for the title, crimson for errors, etc.).
          color: "var(--parchment-50)",
        }}
      >
        {loading && (
          <p style={{ color: "var(--parchment-200)" }}>Loading…</p>
        )}
        {!loading && err && (
          <p style={{ color: "var(--crimson-300)" }}>{err}</p>
        )}
        {!loading && clan && (
          <>
            <div className="row" style={{ alignItems: "center", gap: 12, marginBottom: "var(--sp-3)" }}>
              <ClanCrest animal={clan.animal_icon} size={56} />
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)", color: "var(--gold-300)", textShadow: "2px 2px 0 var(--ink-900)" }}>
                  {clan.name}{" "}
                  <span style={{ fontSize: 14, color: "var(--parchment-200)" }}>[{clan.tag}]</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--parchment-200)" }}>
                  {clan.member_count} of {CLAN_MAX_MEMBERS} members · {Number(clan.total_xp_week).toLocaleString()} weekly XP
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  color: "var(--parchment-50)",
                  border: "2px solid var(--parchment-200)",
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontSize: 14,
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="stack" style={{ gap: 0 }}>
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="between"
                  style={{
                    padding: "var(--sp-2) 0",
                    borderBottom: "2px dashed var(--saddle-500)",
                    fontFamily: "var(--font-display)",
                    color: "var(--parchment-50)",
                  }}
                >
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <Avatar
                      initials={m.initials ?? "??"}
                      color={m.avatar_color ?? "var(--gold-300)"}
                      size={28}
                      fontSize={11}
                      frame={m.equipped_frame ?? null}
                      hat={m.equipped_hat ?? null}
                    />
                    <div>
                      <div style={{ fontSize: 14, color: "var(--parchment-50)" }}>
                        {m.username ?? "?"}
                        {m.role === "leader" && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--gold-300)" }}>★</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "var(--gold-300)" }}>
                      {Number(m.weekly_xp).toLocaleString()} XP
                    </div>
                    <div style={{ fontSize: 10, color: "var(--parchment-200)" }}>
                      {memberContribution(m, members)} · {relativeLastActive(m.last_active_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Clan card (browse list)
// ============================================================
function ClanCard({
  clan,
  joinable,
  inviteOnly,
  onJoin,
  disabled,
}: {
  clan: Clan;
  joinable: boolean;
  inviteOnly: boolean;
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
            [{clan.tag}] · {clan.member_count}/{CLAN_MAX_MEMBERS}{inviteOnly ? " · 🔒" : ""}
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
        {inviteOnly ? "Invite only" : joinable ? "Join" : "Full"}
      </button>
    </div>
  );
}

// ============================================================
// Create clan modal
// ============================================================
function CreateClanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [animalIcon, setAnimalIcon] = useState<ClanAnimal>("sheriffs_badge");
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
    <ModalShell onClose={onClose} title="Found a Clan">
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
          <AnimalGrid value={animalIcon} onChange={setAnimalIcon} />
        </div>
        <button className="btn btn-lg btn-block" onClick={go} disabled={busy || !name || !tag}>
          {busy ? "..." : `Found (${CLAN_FOUNDING_FEE.toLocaleString()}¢)`}
        </button>
        {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
      </div>
    </ModalShell>
  );
}

// ============================================================
// Settings modal (leader-only)
// ============================================================
function SettingsModal({
  clan,
  onClose,
  onSaved,
}: {
  clan: Clan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(clan.name);
  const [tag, setTag] = useState(clan.tag);
  const [animalIcon, setAnimalIcon] = useState<ClanAnimal>(clan.animal_icon);
  const [inviteOnly, setInviteOnly] = useState<boolean>(!!clan.invite_only);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/clans/${clan.id}/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, tag, animalIcon, inviteOnly }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    onSaved();
  }

  return (
    <ModalShell onClose={onClose} title="Clan Settings">
      <div className="stack-lg">
        <div>
          <label className="label">Name</label>
          <input type="text" value={name} maxLength={20}
            onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <label className="label">Tag</label>
          <input type="text" value={tag} maxLength={4}
            onChange={(e) => setTag(e.target.value.toUpperCase())} style={{ width: "100%" }} />
        </div>
        <div>
          <label className="label">Animal</label>
          <AnimalGrid value={animalIcon} onChange={setAnimalIcon} />
        </div>
        <div>
          <label className="label">Membership</label>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn btn-block ${!inviteOnly ? "" : "btn-ghost"}`}
              onClick={() => setInviteOnly(false)}
            >
              Open
            </button>
            <button
              type="button"
              className={`btn btn-block ${inviteOnly ? "" : "btn-ghost"}`}
              onClick={() => setInviteOnly(true)}
            >
              Invite only
            </button>
          </div>
          <p className="text-mute" style={{ fontSize: 12, marginTop: 6 }}>
            Open: anyone can join. Invite only: members must accept an invite from a leader.
          </p>
        </div>
        <button className="btn btn-lg btn-block" onClick={go} disabled={busy}>
          {busy ? "Saving..." : "Save changes"}
        </button>
        {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
      </div>
    </ModalShell>
  );
}

// ============================================================
// Invite modal (leader-only)
// ============================================================
function InviteModal({
  clanId,
  pending,
  onClose,
  onSent,
}: {
  clanId: string;
  pending: ClanInviteOut[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function go() {
    if (!username.trim()) return;
    setBusy(true); setError(null); setSent(null);
    const r = await fetch(`/api/clans/${clanId}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setSent(d.username ?? username.trim());
    setUsername("");
    onSent();
  }

  return (
    <ModalShell onClose={onClose} title="Invite a player">
      <div className="stack-lg">
        <div>
          <label className="label">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Their exact username"
            style={{ width: "100%" }}
            onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          />
        </div>
        <button className="btn btn-lg btn-block" onClick={go} disabled={busy || !username.trim()}>
          {busy ? "Sending..." : "Send invite"}
        </button>
        {sent && <p className="text-money" style={{ fontFamily: "var(--font-display)" }}>Invite sent to {sent}!</p>}
        {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}

        {pending.length > 0 && (
          <div>
            <div className="divider">Pending</div>
            <div className="stack" style={{ gap: 4 }}>
              {pending.map((p) => (
                <div key={p.id} className="between" style={{ padding: "var(--sp-2) 0", fontSize: 13 }}>
                  <span>{p.invitee_username ?? "?"}</span>
                  <span className="text-mute" style={{ fontSize: 11 }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ============================================================
// Clan chat
// ============================================================
function ClanChat({
  clanId,
  messages,
  meId,
  onSent,
}: {
  clanId: string;
  messages: ClanChatMessagePublic[];
  meId: string;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true); setErr(null);
    const r = await fetch(`/api/clans/${clanId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    const d = await r.json();
    setSending(false);
    if (!r.ok) { setErr(labelFor(d.error ?? "error")); return; }
    setDraft("");
    onSent();
  }

  return (
    <div className="panel" style={{ padding: "var(--sp-5)", display: "flex", flexDirection: "column" }}>
      <div className="panel-title">Clan Chat</div>
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          minHeight: 220,
          maxHeight: 320,
          overflowY: "auto",
          padding: "var(--sp-2)",
          background: "var(--parchment-200)",
          border: "2px solid var(--saddle-300)",
          marginBottom: "var(--sp-3)",
        }}
      >
        {messages.length === 0 ? (
          <p className="text-mute" style={{ fontSize: 13, textAlign: "center", marginTop: "var(--sp-4)" }}>
            No messages yet. Say hello.
          </p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {messages.map((m) => {
              const mine = m.user_id === meId;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <Avatar
                    initials={m.initials}
                    color={m.avatar_color}
                    size={26}
                    fontSize={10}
                    frame={m.equipped_frame ?? null}
                    hat={m.equipped_hat ?? null}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      color: mine ? "var(--gold-500)" : "var(--saddle-500)",
                    }}>
                      {m.username}
                    </div>
                    <div style={{ fontSize: 14, wordBreak: "break-word" }}>
                      {m.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          maxLength={500}
          placeholder="Yell at your clanmates..."
          style={{ flex: 1 }}
          disabled={sending}
        />
        <button className="btn" onClick={send} disabled={sending || !draft.trim()}>
          Send
        </button>
      </div>
      {err && <p style={{ color: "var(--crimson-500)", marginTop: 6, fontSize: 12 }}>{err}</p>}
    </div>
  );
}

// ============================================================
// Clan history
// ============================================================
function ClanHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="panel-title">Past Seasons</div>
      {entries.length === 0 ? (
        <p className="text-mute" style={{ fontSize: 13 }}>
          No past seasons yet. Win some games this week to write some history.
        </p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {entries.map((e) => {
            const tier =
              e.rank === 1 ? "legendary" :
              e.rank <= 3 ? "epic" :
              e.rank <= 10 ? "rare" : "none";
            const tierColor =
              tier === "legendary" ? "var(--gold-300)" :
              tier === "epic" ? "var(--crimson-300)" :
              tier === "rare" ? "var(--sky-300)" :
              "var(--saddle-300)";
            return (
              <div
                key={e.season_id}
                className="between"
                style={{
                  padding: "var(--sp-2) var(--sp-3)",
                  borderBottom: "2px dashed var(--saddle-300)",
                  fontFamily: "var(--font-display)",
                }}
              >
                <div>
                  <div style={{ fontSize: 14 }}>
                    Week of {new Date(e.week_start).toLocaleDateString()}
                  </div>
                  <div className="text-mute" style={{ fontSize: 11 }}>
                    {e.total_xp.toLocaleString()} XP
                  </div>
                </div>
                <span
                  style={{
                    background: tierColor,
                    color: "var(--ink-900)",
                    border: "2px solid var(--ink-900)",
                    padding: "2px 8px",
                    fontSize: 12,
                    letterSpacing: "var(--ls-loose)",
                  }}
                >
                  RANK {e.rank}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Chest loot preview — what's in each tier
// ============================================================
function ChestLootPreview() {
  return (
    <div className="panel" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-4)" }}>
      <div className="panel-title">Chest Loot</div>
      <p className="text-mute" style={{ fontSize: 13, marginBottom: "var(--sp-4)" }}>
        Earned at the end of every weekly season. The higher your clan's rank, the better the chest.
      </p>
      <div className="grid grid-3" style={{ gap: "var(--sp-3)" }}>
        {CHEST_LOOT_PREVIEW.map((entry) => (
          <ChestPreviewCard key={entry.tier} entry={entry} />
        ))}
      </div>
      <div
        style={{
          marginTop: "var(--sp-4)",
          padding: "var(--sp-3)",
          background: "var(--parchment-200)",
          border: "2px dashed var(--saddle-300)",
        }}
      >
        <div
          className="label"
          style={{ marginBottom: 6 }}
        >
          Card drop chances
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((tier) => {
            const total = Object.values(CARD_TIER_WEIGHTS).reduce((a, b) => a + b, 0);
            const pct = ((CARD_TIER_WEIGHTS[tier] ?? 0) / total) * 100;
            const color =
              tier === 5 ? "var(--gold-300)" :
              tier === 4 ? "var(--crimson-300)" :
              tier === 3 ? "var(--sky-300)" :
              tier === 2 ? "var(--cactus-300)" :
              "var(--saddle-300)";
            return (
              <span
                key={tier}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: color,
                  color: tier === 5 ? "var(--ink-900)" : "var(--parchment-50)",
                  border: "2px solid var(--ink-900)",
                  padding: "2px 8px",
                  fontFamily: "var(--font-display)",
                  fontSize: 12,
                  letterSpacing: "var(--ls-loose)",
                }}
              >
                {CARD_TIER_LABEL[tier]} {pct.toFixed(0)}%
              </span>
            );
          })}
        </div>
        <p className="text-mute" style={{ fontSize: 11, marginTop: 8 }}>
          Each card slot rolls independently. Higher property tiers are rarer but pay
          more on the Monopoly board.
        </p>
      </div>
    </div>
  );
}

function ChestPreviewCard({ entry }: { entry: typeof CHEST_LOOT_PREVIEW[number] }) {
  const tone = CHEST_TIER_COLOR[entry.tier];
  return (
    <div
      style={{
        background: "var(--parchment-100)",
        border: `4px solid ${tone.ring}`,
        boxShadow: `0 0 16px ${tone.glow}`,
        padding: "var(--sp-3)",
        position: "relative",
      }}
    >
      {/* Tier banner */}
      <div
        style={{
          background: tone.bg,
          color: tone.fg,
          fontFamily: "var(--font-display)",
          fontSize: 14,
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          textAlign: "center",
          padding: "4px 8px",
          marginBottom: "var(--sp-3)",
          border: "2px solid var(--ink-900)",
          textShadow: entry.tier === "legendary" ? "1px 1px 0 var(--gold-100)" : "1px 1px 0 var(--ink-900)",
        }}
      >
        {CHEST_TIER_LABEL[entry.tier]}
      </div>

      {/* Mini chest + rank */}
      <div className="row" style={{ justifyContent: "center", marginBottom: "var(--sp-3)" }}>
        <MiniChest tier={entry.tier} />
      </div>

      <div
        style={{
          textAlign: "center",
          fontFamily: "var(--font-display)",
          fontSize: 12,
          color: "var(--saddle-400)",
          marginBottom: "var(--sp-3)",
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
        }}
      >
        {entry.rankRange}
      </div>

      <p className="text-mute" style={{ fontSize: 12, textAlign: "center", marginBottom: "var(--sp-3)" }}>
        {entry.blurb}
      </p>

      <div className="stack" style={{ gap: 6 }}>
        <LootBullet
          icon="slot.gold"
          label="Cash"
          value={`${entry.coinsMin.toLocaleString()}-${entry.coinsMax.toLocaleString()} ¢`}
        />
        <LootBullet
          icon="lobby.monopoly"
          label="Monopoly cards"
          value={`${entry.cards}× random`}
        />
        <LootBullet
          icon="ui.crown"
          label="Bonus daily spin"
          value={
            entry.spinTokenChance === 1
              ? "Guaranteed"
              : entry.spinTokenChance > 0
              ? `${Math.round(entry.spinTokenChance * 100)}% chance`
              : "—"
          }
          dim={entry.spinTokenChance === 0}
        />
      </div>
    </div>
  );
}

function LootBullet({
  icon,
  label,
  value,
  dim,
}: {
  icon: string;
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "var(--sp-2)",
        background: dim ? "var(--parchment-200)" : "var(--parchment-50)",
        border: "2px solid var(--saddle-300)",
        opacity: dim ? 0.6 : 1,
      }}
    >
      <GameIcon name={icon as Parameters<typeof GameIcon>[0]["name"]} size={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-mute" style={{ fontSize: 10, letterSpacing: "var(--ls-loose)", textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 13 }}>{value}</div>
      </div>
    </div>
  );
}

function MiniChest({ tier }: { tier: ClanChestTier }) {
  const tone = CHEST_TIER_COLOR[tier];
  return (
    <div style={{ position: "relative", width: 64, height: 52 }}>
      {/* Lid */}
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 0,
          width: 56,
          height: 18,
          background: tone.bg,
          border: `3px solid ${tone.ring}`,
          borderRadius: "10px 10px 0 0",
          boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.25)",
        }}
      />
      {/* Body */}
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 14,
          width: 56,
          height: 36,
          background: tone.bg,
          border: `3px solid ${tone.ring}`,
          boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.35), inset 0 3px 0 rgba(255,255,255,0.2)",
        }}
      />
      {/* Lock */}
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 14,
          width: 9,
          height: 9,
          background: "var(--gold-300)",
          border: "2px solid var(--ink-900)",
        }}
      />
    </div>
  );
}

// ============================================================
// Reusable bits
// ============================================================
/** Render a member's % share of the clan's weekly XP — quick read
 *  on who's pulling weight this week. */
function memberContribution(m: EnrichedMember, all: EnrichedMember[]): string {
  const total = all.reduce((s, x) => s + Number(x.weekly_xp ?? 0), 0);
  if (total === 0) return "0%";
  const pct = Math.round((Number(m.weekly_xp ?? 0) / total) * 100);
  return `${pct}%`;
}

/** "active 3h ago" style relative time for the last-active line. */
function relativeLastActive(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 1)   return "now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}

function ClanCrest({ animal, size }: { animal: ClanAnimal; size: number }) {
  // V3 emblems live in /public/clan-icons; legacy animal ids fall
  // back to the hand-pixeled GameIcon sprites.
  const svg = CLAN_EMBLEM_FILE[animal];
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
        overflow: "hidden",
      }}
    >
      {svg ? (
        <img
          src={svg}
          width={size - 6}
          height={size - 6}
          alt=""
          aria-hidden
          style={{ display: "block", imageRendering: "pixelated" }}
        />
      ) : (
        // Legacy animal fallback — only the eight v1 ids are in the
        // GameIcon clan.* sprite set, so cast through unknown rather
        // than widen IconName to cover ids that already have SVGs.
        <GameIcon
          name={(`clan.${animal}` as unknown) as Parameters<typeof GameIcon>[0]["name"]}
          size={Math.floor(size * 0.85)}
        />
      )}
    </div>
  );
}

function AnimalGrid({ value, onChange }: { value: ClanAnimal; onChange: (a: ClanAnimal) => void }) {
  // V3+ emblem set is the picker. Legacy animals stay supported for
  // existing clans but new clans pick from the themed emblems.
  return (
    <div className="grid grid-4" style={{ gap: 6 }}>
      {CLAN_EMBLEMS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => onChange(a.key)}
          style={{
            background: value === a.key ? "var(--gold-300)" : "var(--parchment-50)",
            border: value === a.key ? "3px solid var(--ink-900)" : "2px solid var(--saddle-300)",
            padding: "var(--sp-2)",
            cursor: "pointer",
            fontFamily: "var(--font-display)",
            fontSize: 11,
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
            boxShadow: value === a.key ? "var(--glow-gold)" : undefined,
          }}
        >
          <ClanCrest animal={a.key} size={48} />
          <div>{a.name}</div>
        </button>
      ))}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          background: "var(--parchment-100)",
          border: "4px solid var(--ink-900)",
        }}
      >
        <div className="between" style={{ marginBottom: "var(--sp-3)" }}>
          <div className="panel-title" style={{ marginBottom: 0 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "var(--saddle-300)",
              color: "var(--parchment-50)",
              border: "2px solid var(--ink-900)",
              padding: "2px 10px",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Chest opening overlay (unchanged from v1)
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
    invite_only: "That clan is invite-only.",
    not_leader: "Only the clan leader can do that.",
    not_in_clan: "You're not in that clan.",
    cant_kick_self: "Use 'Leave Clan' instead.",
    cant_kick_leader: "Can't kick the leader.",
    target_not_in_clan: "That player isn't in your clan.",
    user_not_found: "No player with that exact username.",
    cant_invite_self: "Can't invite yourself.",
    user_already_in_clan: "That player is already in a clan.",
    already_invited: "Already invited.",
    invite_not_found: "Invite expired or already resolved.",
    not_in_clan_msg: "You aren't in that clan.",
    empty: "Type something first.",
    too_long: "Too long.",
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
