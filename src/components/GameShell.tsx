// Server component shell every game page wraps with.
// Renders site header + balance bar + game title.

import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { readSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db";
import { getBalance } from "@/lib/wallet";

export async function GameShell({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  const s = await readSession();
  if (!s) redirect("/sign-in");
  const user = (await getUserById(s.user.id))!;
  const balance = await getBalance(user.id);

  return (
    <>
      <SiteHeader current="lobby" />
      <main className="page">
        <div className="row-lg" style={{ marginBottom: "var(--sp-6)", flexWrap: "wrap" }}>
          <Link href="/lobby" className="btn btn-ghost btn-sm">← Lobby</Link>
          <div className="balance-bar">
            <div className="avatar" style={{ background: user.avatar_color }}>
              {user.initials}
            </div>
            <div className="avatar-username">
              <div className="uname">{user.username}</div>
              <div className="role">PLAYER</div>
            </div>
            <div className="balance" data-balance>{balance.toLocaleString()} ¢</div>
          </div>
        </div>

        <div style={{ marginBottom: "var(--sp-5)" }}>
          <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: "var(--sp-2)" }}>{title}</h1>
          {blurb && <p className="text-mute">{blurb}</p>}
        </div>

        {children}
      </main>
    </>
  );
}
