"use client";

import { useEffect, useState } from "react";
import { APP_URL, REPO } from "@/lib/site";
import type { Asset } from "@/lib/github";
import { useRelease } from "./GitHub";
import { OsIcon } from "./OsIcon";

type Platform = "macOS" | "Windows" | "Linux" | "Android";

const platforms: { os: Platform; detail: string; preview?: boolean; files: { label: string; match: RegExp }[] }[] = [
  {
    os: "macOS",
    detail: "Apple Silicon and Intel",
    files: [
      { label: "Apple Silicon", match: /aarch64\.dmg$/ },
      { label: "Intel", match: /x64\.dmg$/ },
    ],
  },
  {
    os: "Windows",
    detail: "Windows 10 and 11",
    files: [
      { label: "Installer (.exe)", match: /setup\.exe$/ },
      { label: ".msi", match: /\.msi$/ },
    ],
  },
  {
    os: "Linux",
    detail: "AppImage and .deb",
    files: [
      { label: ".AppImage", match: /amd64\.AppImage$/ },
      { label: ".deb", match: /amd64\.deb$/ },
    ],
  },
  {
    os: "Android",
    detail: "Android 8 and later",
    preview: true,
    files: [{ label: ".apk", match: /android\.apk$/ }],
  },
];

function size(bytes: number) {
  return `${Math.round(bytes / 1e6)} MB`;
}

function detectOs(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = `${nav.userAgentData?.platform ?? ""} ${nav.platform} ${nav.userAgent}`;
  if (/Android/i.test(nav.userAgent)) return "Android";
  if (/iPhone|iPad/i.test(nav.userAgent)) return null;
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
            <OsIcon os={p.os} size={30} />
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
            {(p.preview || mine === p.os) && (
              <div className="platform-badges">
                {mine === p.os && <span className="badge">Your system</span>}
                {p.preview && <span className="badge quiet">Preview</span>}
              </div>
            )}
          </div>
        ))}
        <div className="platform">
          <OsIcon os="Web" size={30} />
          <h3>Web</h3>
          <p>Nothing to install</p>
          <div className="platform-files">
            <a className="button primary" href={APP_URL}>
              Open the app
            </a>
          </div>
          <div className="platform-badges">
            <span className="badge quiet">Preview</span>
          </div>
        </div>
      </div>
      <div className="unsigned">
        <strong>Before you install:</strong> builds aren&apos;t code-signed yet, so your OS asks you to confirm the first
        time. On macOS, open <em>System Settings → Privacy &amp; Security</em> and click <em>Open Anyway</em>. On Windows,
        click <em>More info → Run anyway</em>. Building from source avoids both. On Android, allow installs from your browser
        when asked.{" "}
        <a href={`${REPO}/releases`}>All releases</a>
      </div>
    </div>
  );
}
