"use client";

import { useEffect, useState } from "react";
import { RELEASES } from "@/lib/site";


function detect(): string | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  if (nav.userAgentData?.mobile || /iPhone|iPad|Android/i.test(nav.userAgent)) return null;
  const p = `${nav.userAgentData?.platform ?? ""} ${nav.platform} ${nav.userAgent}`;
  if (/mac/i.test(p)) return "macOS";
  if (/win/i.test(p)) return "Windows";
  if (/linux|x11/i.test(p)) return "Linux";
  return null;
}

/** "Download for <your OS>", falling back to a plain "Download" before hydration and on phones. */
export function DownloadButton({ className = "button primary" }: { className?: string }) {
  const [os, setOs] = useState<string | null>(null);
  useEffect(() => setOs(detect()), []);
  return (
    <a className={className} href={RELEASES}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" />
      </svg>
      {os ? `Download for ${os}` : "Download"}
    </a>
  );
}
