import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { readSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db";
import { findItem } from "@/lib/shop/catalog";
import { IdleTimeout } from "@/components/IdleTimeout";
import { BrokeModal } from "@/components/BrokeModal";
import { WhatsNewModal } from "@/components/WhatsNewModal";

export const metadata: Metadata = {
  title: "Lucas Games",
  description: "A pixel saloon for the wild west of mini-games.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4a2818",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the active theme key (e.g. "frontier") so we can paint the page
  // chrome on first render — no FOUC when switching themes.
  let themeKey = "saloon";
  let signedIn = false;
  try {
    const s = await readSession();
    if (s) {
      signedIn = true;
      const user = await getUserById(s.user.id);
      const itemId = user?.equipped_theme;
      if (itemId) {
        const item = findItem(itemId);
        const k = (item?.meta as { theme?: string } | undefined)?.theme;
        if (k) themeKey = k;
      }
    }
  } catch {
    // Anonymous / sign-in pages — fall through to the default.
  }

  return (
    <html lang="en" data-theme={themeKey}>
      <body>
        {children}
        {signedIn ? <IdleTimeout /> : null}
        {signedIn ? <BrokeModal /> : null}
        {signedIn ? <WhatsNewModal /> : null}
        <SpeedInsights />
      </body>
    </html>
  );
}
