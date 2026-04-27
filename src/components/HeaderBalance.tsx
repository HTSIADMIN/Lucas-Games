import { Avatar } from "@/components/Avatar";

// Compact profile + balance pill rendered in the SiteHeader's right slot
// while a player is inside a game. Lets the cash stay visible at all times.

export function HeaderBalance({
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
  return (
    <div className="header-balance">
      <Avatar
        initials={initials}
        color={avatarColor}
        size={32}
        fontSize={13}
        level={level}
        frame={frame}
        hat={hat}
        champion={champion}
      />
      <div className="header-balance-text">
        <span className="header-balance-name">{username}</span>
        <span className="header-balance-coins" data-balance>
          {balance.toLocaleString()} ¢
        </span>
      </div>
    </div>
  );
}
