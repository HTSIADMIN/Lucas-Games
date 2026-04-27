import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { AppLive } from "@/components/social/AppLive";
import { HeaderPresence } from "@/components/social/HeaderPresence";
import { readSession } from "@/lib/auth/session";
import { getUserById, listInventory, recentChatMessages } from "@/lib/db";
import { getBalance } from "@/lib/wallet";
import { getChampionId } from "@/lib/champion";
import { CATALOG } from "@/lib/shop/catalog";
import { ShopClient } from "./ShopClient";

export default async function ShopPage() {
  const s = await readSession();
  if (!s) redirect("/sign-in");
  const user = (await getUserById(s.user.id))!;
  const owned = await listInventory(user.id);
  const balance = await getBalance(user.id);
  const initialChat = await recentChatMessages(50);
  const championId = await getChampionId();
  const me = {
    id: user.id,
    username: user.username,
    avatarColor: user.avatar_color,
    initials: user.initials,
    frame: user.equipped_frame ?? null,
    hat: user.equipped_hat ?? null,
  };

  return (
    <AppLive me={me} initialChat={initialChat} game="shop" championId={championId}>
      <SiteHeader current="shop" centerSlot={<HeaderPresence currentUserId={user.id} />} />
      <main className="page">
        <h1 style={{ fontSize: "var(--fs-h1)", marginBottom: "var(--sp-2)" }}>The General Store</h1>
        <p className="text-mute" style={{ marginBottom: "var(--sp-6)" }}>
          Spend Coins on flair. Cosmetic only — pure flex.
        </p>

        <ShopClient
          initialBalance={balance}
          initialOwned={owned}
          equipped={{
            avatar_color: user.avatar_color,
            frame: user.equipped_frame ?? null,
            card_deck: user.equipped_card_deck ?? "deck_classic",
            theme: user.equipped_theme ?? "saloon",
            hat: user.equipped_hat ?? null,
          }}
          catalog={CATALOG}
        />
      </main>
    </AppLive>
  );
}
