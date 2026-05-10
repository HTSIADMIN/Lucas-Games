import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { readSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db";
import { findItem } from "@/lib/shop/catalog";
import { IdleTimeout } from "@/components/IdleTimeout";
import { BrokeModal } from "@/components/BrokeModal";
import { WhatsNewModal } from "@/components/WhatsNewModal";

// metadataBase resolves relative URLs in openGraph + twitter image
// fields. Prefer the site URL set in env (production), fall back to
// the Vercel preview URL, and fall back again to localhost so dev
// build doesn't warn.
const siteOrigin = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
})();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "Lucas Games",
    template: "%s · Lucas Games",
  },
  description:
    "A pixel-saloon casino of free-to-play mini-games — slots, blackjack, plinko, daily spin, and the Penny Pinchers clicker. Spin, slot, click, win.",
  applicationName: "Lucas Games",
  // Next.js auto-discovers /app/icon.svg; this opts the favicon
  // into the metadata pipeline so older browsers also pick it up.
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  // The /app/opengraph-image.tsx route generates the 1200×630 card —
  // Next.js plumbs it into both `openGraph.images` and
  // `twitter.images` automatically. We just set the metadata
  // surrounding it.
  openGraph: {
    title: "Lucas Games — Pixel Saloon",
    description:
      "A wild-west casino of free-to-play mini-games. Spin · Slot · Click · Win.",
    siteName: "Lucas Games",
    type: "website",
    locale: "en_US",
    url: siteOrigin,
  },
  twitter: {
    card: "summary_large_image",
    title: "Lucas Games — Pixel Saloon",
    description:
      "A wild-west casino of free-to-play mini-games. Spin · Slot · Click · Win.",
  },
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
        <Analytics />
      </body>
    </html>
  );
}
