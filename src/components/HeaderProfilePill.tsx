"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveBalance } from "@/components/LiveBalance";
import { useLive } from "@/components/social/LiveProvider";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";
import { ProfileModal } from "@/components/social/ProfileModal";

// Lobby-style profile pill rendered in the SiteHeader's right side
// (replaces the bare 'Profile' link). Same balance-bar markup the
// lobby content uses — avatar with level ring, username + LVL
// badge, live balance pill — but compact enough for a header.
//
// Tapping the username (or the avatar block) opens the
// ProfileModal. Reads `me` from useLive() and live balance from
// useAppSnapshot() so it self-renders on every authed page that
// wraps in <AppLive>.

export function HeaderProfilePill() {
  const { me, championId } = useLive();
  const { snapshot } = useAppSnapshot();
  const [open, setOpen] = useState(false);

  if (!me || !snapshot) return null;
  const level = me.level ?? 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${me.username}'s profile`}
        className="balance-bar"
        style={{
          // Shrink slightly so the bar fits next to the nav links
          // without wrapping. Lobby content uses size 48 + sp-3 gap;
          // header gets 36 + sp-2.
          gap: "var(--sp-2)",
          padding: "4px var(--sp-3) 4px 4px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <Avatar
          initials={me.initials}
          color={me.avatarColor}
          size={36}
          fontSize={14}
          level={level}
          frame={me.frame ?? null}
          hat={me.hat ?? null}
          champion={me.id === championId}
        />
        <div className="avatar-username">
          <div className="uname" style={{ fontSize: "var(--fs-body)" }}>{me.username}</div>
          <div className="role" style={{ fontSize: 10 }}>LVL {level}</div>
        </div>
        <LiveBalance initial={snapshot.balance} className="balance" />
      </button>
      {open && <ProfileModal userId="me" onClose={() => setOpen(false)} />}
    </>
  );
}
