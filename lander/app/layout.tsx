import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const description =
  "A beautiful, open-source workspace for notes, docs and databases. Every page is a plain file on your own computer, and your AI agents read only what you share.";

export const metadata: Metadata = {
  metadataBase: new URL("https://devian-labs.github.io"),
  title: "Betelgeuse: a beautiful workspace that stays yours",
  description,
  openGraph: {
    title: "Betelgeuse",
    description,
    type: "website",
    siteName: "Betelgeuse",
  },
  twitter: { card: "summary_large_image", title: "Betelgeuse", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdfb" },
    { media: "(prefers-color-scheme: dark)", color: "#141110" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
