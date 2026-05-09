"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveBalance } from "@/components/LiveBalance";
import { useLive } from "@/components/social/LiveProvider";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";
import { ProfileModal } from "@/components/social/ProfileModal";

// Replaces the bare 'Profile' button in the desktop nav with the
// same avatar + username + balance pill that game pages render on
// the right side of the header. Username is a button — tap it to
// open the profile modal. Reads `me` from useLive() (LiveProvider)
// and the live balance from useAppSnapshot(). Both providers wrap
// every authed page via AppLive, so the pill renders on lobby /
// shop / leaderboard / clans / game pages without re-threading
// user data from the server through the SiteHeader props.

export function HeaderProfilePill() {
  const { me, championId } = useLive();
  const { snapshot } = useAppSnapshot();
  const [open, setOpen] = useState(false);

  if (!me || !snapshot) return null;

  return (
    <>
      <div className="header-balance" style={{ marginLeft: "var(--sp-2)" }}>
        <Avatar
          initials={me.initials}
          color={me.avatarColor}
          size={32}
          fontSize={13}
          frame={me.frame ?? null}
          hat={me.hat ?? null}
          champion={me.id === championId}
        />
        <div className="header-balance-text">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="header-balance-name"
            aria-label={`Open ${me.username}'s profile`}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              font: "inherit",
              color: "inherit",
              textAlign: "left",
            }}
          >
            {me.username}
          </button>
          <LiveBalance initial={snapshot.balance} className="header-balance-coins" />
        </div>
      </div>
      {open && <ProfileModal userId="me" onClose={() => setOpen(false)} />}
    </>
  );
}
