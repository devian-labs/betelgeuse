import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { ORG, SITE_NAME, SITE_URL, jsonLd } from "@/lib/site";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const description =
  "Free, open-source app for notes, docs and databases. Every page is a Markdown file in git on your computer, and AI agents read only the pages you share.";

// Defaults for every route; each page sets its own title, description, canonical and social cards (lib/site.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Open-Source Markdown Notes & Docs App | Betelgeuse", template: "%s | Betelgeuse" },
  description,
  applicationName: SITE_NAME,
  publisher: ORG.name,
  authors: [{ name: ORG.name, url: ORG.url }],
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", description },
  twitter: { card: "summary_large_image", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdfb" },
    { media: "(prefers-color-scheme: dark)", color: "#141110" },
  ],
};

// Who publishes the site, on every page.
const site = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${ORG.url}/#organization`, name: ORG.name, url: ORG.url, sameAs: [ORG.github] },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: "en",
      publisher: { "@id": `${ORG.url}/#organization` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(site)} />
        {children}
      </body>
    </html>
  );
}
