"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveBalance } from "@/components/LiveBalance";
import { ProfileModal } from "@/components/social/ProfileModal";

// Client-only balance-bar variant for the lobby page so the avatar
// + name can open the ProfileModal without making the whole lobby
// page client-rendered. Visual layout is identical to the previous
// inline markup — just wraps the avatar / name in a button.

export function LobbyBalanceBar({
  initials,
  avatarColor,
  username,
  level,
  frame,
  hat,
  champion,
  balance,
}: {
  initials: string;
  avatarColor: string;
  username: string;
  level: number;
  frame: string | null;
  hat: string | null;
  champion: boolean;
  balance: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="balance-bar">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${username}'s profile`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sp-3)",
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
          }}
        >
          <Avatar
            initials={initials}
            color={avatarColor}
            size={48}
            level={level}
            frame={frame}
            hat={hat}
            champion={champion}
          />
          <div className="avatar-username" style={{ textAlign: "left" }}>
            <div className="uname">{username}</div>
            <div className="role">LVL {level}</div>
          </div>
        </button>
        <LiveBalance initial={balance} className="balance" />
      </div>
      {open && <ProfileModal userId="me" onClose={() => setOpen(false)} />}
    </>
  );
}
