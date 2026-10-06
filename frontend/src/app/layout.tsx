import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Instrument_Serif, Sora } from "next/font/google";
import "./globals.css";
import { AuroraBackdrop } from "@/components/visual/aurora-backdrop";
import { Providers } from "@/components/providers";
import { THEME_SCRIPT } from "@/lib/theme/script";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Premium display face for headings (pairs with Geist body + Instrument Serif italics).
const heading = Sora({ variable: "--font-sora", weight: ["600", "700"], subsets: ["latin"] });
const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
const TITLE = "MoneyWealth AI — Your AI financial advisor";
const DESCRIPTION =
  "MoneyWealth AI turns your real bank data into clear, grounded guidance — budgets, goals, debt and portfolio, with an AI advisor that never invents numbers.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: TITLE, template: "%s · MoneyWealth AI" },
  description: DESCRIPTION,
  applicationName: "MoneyWealth AI",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "MoneyWealth AI",
    title: TITLE,
    description: DESCRIPTION,
    url: APP_URL,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7faf9" },
    { media: "(prefers-color-scheme: dark)", color: "#070f0c" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Opt into dynamic rendering so the per-request CSP nonce (proxy.ts) is
  // stamped onto Next's scripts — a nonce can't be applied to a static page.
  await connection();
  // The blocking theme script is inline, so it needs the same per-request nonce
  // the CSP allows; without it 'strict-dynamic' would block it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${heading.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Sets the theme class on <html> before first paint — no flash.
            suppressHydrationWarning: browsers blank the nonce *attribute* after
            parse (CSP nonce hiding), so React would see nonce="" vs the prop. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-medium focus:text-on-brand"
        >
          Skip to content
        </a>
        <AuroraBackdrop />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
