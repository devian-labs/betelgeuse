import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Telemetry } from "@/components/Telemetry";
import "./globals.css";

export const metadata: Metadata = {
  title: "Betelgeuse",
  description: "Your notes, docs and databases in the browser. Every page stays a Markdown file in your own GitHub repository.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#fffdfb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div id="root">{children}</div>
        <Telemetry />
      </body>
    </html>
  );
}
