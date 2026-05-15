"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveBalance } from "@/components/LiveBalance";
import { useLive } from "@/components/social/LiveProvider";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";
import { ProfileModal } from "@/components/social/ProfileModal";
import { WinningsTicker } from "@/components/WinningsTicker";
import { StreakFlame } from "@/components/StreakFlame";

// Compact header-right pill — avatar with level ring, username +
// LVL badge, and a live balance pill alongside. The whole row is
// a button; tapping the avatar / name / balance opens the profile
// modal. Reads `me` + balance from the live + snapshot contexts so
// it self-renders on every authed page wrapped in <AppLive>.

export function HeaderProfilePill() {
  const { me, championId } = useLive();
  const { snapshot } = useAppSnapshot();
  const [open, setOpen] = useState(false);

  if (!me || !snapshot) return null;
  const level = me.level ?? 1;
  const streak = snapshot.streak?.length ?? 0;

  return (
    <>
      <div className="nav-profile-wrap">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${me.username}'s profile`}
          className="nav-profile-pill"
        >
          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            <Avatar
              initials={me.initials}
              color={me.avatarColor}
              size={32}
              fontSize={12}
              level={level}
              frame={me.frame ?? null}
              hat={me.hat ?? null}
              champion={me.id === championId}
            />
            {streak >= 3 && (
              <span
                style={{ position: "absolute", bottom: -4, right: -8, pointerEvents: "none" }}
                title={`On a ${streak}-win hot streak — don't break it now`}
              >
                <StreakFlame n={streak} size="sm" />
              </span>
            )}
          </span>
          <div className="nav-profile-text">
            <div className="nav-profile-uname">{me.username}</div>
            <div className="nav-profile-lvl">LVL {level}</div>
          </div>
          <LiveBalance initial={snapshot.balance} className="nav-profile-balance" />
        </button>
        <WinningsTicker />
      </div>
      {open && <ProfileModal userId="me" onClose={() => setOpen(false)} />}
    </>
  );
}
