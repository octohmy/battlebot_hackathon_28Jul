import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Raleway } from "next/font/google";
import "./globals.css";

/** Matches the condensed heavy face in the BattleBots logo. */
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

/** battlebots.com's own body face. */
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WRECKED — BattleBots Pro League Card Arena",
  description:
    "Draw two bots, trump a stat, let the AI ruin their day. Every number is real BattleBots Pro League data.",
};

export const viewport: Viewport = {
  themeColor: "#07080a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${raleway.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bb-black text-bb-bone">{children}</body>
    </html>
  );
}
