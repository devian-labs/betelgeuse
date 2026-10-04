"use client";

import { useEffect, useState } from "react";
import { REPO } from "@/lib/site";
import type { Asset } from "@/lib/github";
import { useRelease } from "./GitHub";

type Platform = "macOS" | "Windows" | "Linux";

const platforms: { os: Platform; detail: string; files: { label: string; match: RegExp }[]; icon: React.ReactNode }[] = [
  {
    os: "macOS",
    detail: "Apple Silicon and Intel",
    files: [
      { label: "Apple Silicon", match: /aarch64\.dmg$/ },
      { label: "Intel", match: /x64\.dmg$/ },
    ],
    icon: (
      <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.8 2.3 1.1 0 1.6-.7 2.9-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.3-.9-2.3-3.6zM14.2 5.8c.6-.8 1-1.8.9-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.3z" />
    ),
  },
  {
    os: "Windows",
    detail: "Windows 10 and 11",
    files: [
      { label: "Installer (.exe)", match: /setup\.exe$/ },
      { label: ".msi", match: /\.msi$/ },
    ],
    icon: <path d="M3 5.5l7.5-1v7H3zm8.5-1.2L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zm8.5 0H21V21l-9.5-1.3z" />,
  },
  {
    os: "Linux",
    detail: "AppImage and .deb",
    files: [
      { label: ".AppImage", match: /\.AppImage$/ },
      { label: ".deb", match: /\.deb$/ },
    ],
    icon: (
      <path d="M12 2.5c-2.2 0-3.5 1.9-3.5 4.4 0 1.2.3 2-.4 3.2-1 1.6-2.9 3.6-2.9 6.2 0 1 .4 1.8 1 2.2-.4.6-.4 1.4.4 1.8 1 .5 2.4-.2 3.5.2.8.3 1.3.5 1.9.5s1.1-.2 1.9-.5c1.1-.4 2.5.3 3.5-.2.8-.4.8-1.2.4-1.8.6-.4 1-1.2 1-2.2 0-2.6-1.9-4.6-2.9-6.2-.7-1.2-.4-2-.4-3.2 0-2.5-1.3-4.4-3.5-4.4z" />
    ),
  },
];

function size(bytes: number) {
  return `${Math.round(bytes / 1e6)} MB`;
}

function detectOs(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = `${nav.userAgentData?.platform ?? ""} ${nav.platform} ${nav.userAgent}`;
  if (/iPhone|iPad|Android/i.test(nav.userAgent)) return null;
  if (/mac/i.test(p)) return "macOS";
  if (/win/i.test(p)) return "Windows";
  if (/linux|x11/i.test(p)) return "Linux";
  return null;
}

/** One card per platform, wired to the files of the latest GitHub release. */
export function Downloads() {
  const { loading, release } = useRelease();
  const [mine, setMine] = useState<Platform | null>(null);
  useEffect(() => setMine(detectOs()), []);

  const find = (match: RegExp): Asset | undefined => release?.assets.find((a) => match.test(a.name));

  return (
    <div className="downloads">
      <p className="release-line">
        {loading ? (
          "Checking for the latest version…"
        ) : release ? (
          <>
            <strong>{release.version}</strong> · released{" "}
            {new Date(release.date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
            <a href={release.url}>What&apos;s new</a>
          </>
        ) : (
          <>
            <strong>The first release is on its way.</strong> Until then, build it from source below. It takes one command.
          </>
        )}
      </p>
      <div className="platforms">
        {platforms.map((p) => (
          <div key={p.os} className={`platform${mine === p.os ? " mine" : ""}`}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden>
              {p.icon}
            </svg>
            <h3>{p.os}</h3>
            <p>{p.detail}</p>
            <div className="platform-files">
              {p.files.map((f, i) => {
                const asset = find(f.match);
                return asset ? (
                  <a key={f.label} className={`button${i === 0 ? " primary" : ""}`} href={asset.url}>
                    {f.label} <span className="file-size">{size(asset.size)}</span>
                  </a>
                ) : (
                  <span key={f.label} className="button disabled" aria-disabled>
                    {f.label}
                  </span>
                );
              })}
            </div>
            {mine === p.os && <span className="platform-badge">Your system</span>}
          </div>
        ))}
      </div>
      <div className="unsigned">
        <strong>Before you install:</strong> builds aren&apos;t code-signed yet, so your OS asks you to confirm the first
        time. On macOS, open <em>System Settings → Privacy &amp; Security</em> and click <em>Open Anyway</em>. On Windows,
        click <em>More info → Run anyway</em>. Building from source avoids both.{" "}
        <a href={`${REPO}/releases`}>All releases</a>
      </div>
    </div>
  );
}
