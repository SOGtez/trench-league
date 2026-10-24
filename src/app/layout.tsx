import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Trench League — Practice memecoin trading with fake SOL",
    template: "%s · Trench League",
  },
  description:
    "Practice trading Solana memecoins with fake SOL and compete with friends in paper-trading leagues. No wallet, no real money.",
};

/* Every route is auth-aware, so render per request instead of prerendering. */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0B0D10",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-bg text-ink">
        {isSupabaseConfigured() ? null : <SetupNotice />}
        {children}
      </body>
    </html>
  );
}
