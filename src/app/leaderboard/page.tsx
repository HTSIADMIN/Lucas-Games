import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { AppLive } from "@/components/social/AppLive";
import { readSession } from "@/lib/auth/session";
import { getUserById, leaderboard, recentChatMessages } from "@/lib/db";

export default async function LeaderboardPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");

  const user = (await getUserById(s.user.id))!;
  const rows = (await leaderboard()).slice(0, 50);
  const initialChat = await recentChatMessages(50);
  const me = {
    id: user.id,
    username: user.username,
    avatarColor: user.avatar_color,
    initials: user.initials,
  };

  return (
    <>
      <SiteHeader current="leaderboard" />
      <main className="page">
        <AppLive me={me} initialChat={initialChat} game="leaderboard">
        <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: "var(--sp-2)" }}>Leaderboard</h1>
        <p className="text-mute" style={{ marginBottom: "var(--sp-6)" }}>
          Brag rights. Updated live as bets settle.
        </p>

        <div className="leaderboard">
          {rows.length === 0 && (
            <div style={{ padding: "var(--sp-7)", textAlign: "center" }} className="text-mute">
              No players yet. Be the first.
            </div>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className={`leaderboard-row is-${r.rank}`}
              style={r.id === s.user.id ? { background: "var(--gold-100)" } : undefined}
            >
              <div className="rank">{r.rank}</div>
              <div className="player">
                <div className="avatar avatar-sm" style={{ background: r.avatar_color }}>
                  {r.initials}
                </div>
                <span>{r.username}</span>
                {r.id === s.user.id && <span className="tag-new">YOU</span>}
              </div>
              <div className="game">{rankTier(r.rank)}</div>
              <div className="winnings">{r.balance.toLocaleString()} ¢</div>
            </div>
          ))}
        </div>
        </AppLive>
      </main>
    </>
  );
}

function rankTier(rank: number) {
  if (rank === 1) return "Sheriff";
  if (rank <= 3) return "Outlaw";
  if (rank <= 10) return "Gunslinger";
  if (rank <= 25) return "Drifter";
  return "Tenderfoot";
}
