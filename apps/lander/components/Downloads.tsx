"use client";

import { useEffect, useState, type ReactNode } from "react";
import { APP_URL, PLAY_STORE_URL, REPO, SPONSOR } from "@/lib/site";
import type { Asset } from "@/lib/github";
import { useDownloads, useRelease } from "./GitHub";
import { OsIcon } from "./OsIcon";

type Platform = "macOS" | "Windows" | "Linux" | "Android" | "iOS" | "Web";

/** A file from the latest release (`match`) or a fixed link (`url`). */
type Option = { label: string; match?: RegExp; url?: string };

/**
 * Every card has the same shape: what it runs on, the one thing to do on first launch, then the main download as a
 * full-width button and any other formats as a quiet line under it. The buttons sit at the bottom so they line up.
 */
const platforms: {
  os: Platform;
  detail: string;
  badge?: "Preview" | "Soon";
  main: Option;
  others: Option[];
  note: ReactNode;
}[] = [
  {
    os: "macOS",
    detail: "Apple Silicon and Intel",
    main: { label: "Apple Silicon", match: /aarch64\.dmg$/ },
    others: [{ label: "Intel", match: /x64\.dmg$/ }],
    note: (
      <>
        First launch: <em>System Settings → Privacy &amp; Security → Open Anyway</em>.
      </>
    ),
  },
  {
    os: "Windows",
    detail: "Windows 10 and 11",
    main: { label: "Installer (.exe)", match: /setup\.exe$/ },
    others: [{ label: ".msi", match: /\.msi$/ }],
    note: (
      <>
        First launch: <em>More info → Run anyway</em>.
      </>
    ),
  },
  {
    os: "Linux",
    detail: "AppImage and .deb",
    main: { label: ".AppImage", match: /amd64\.AppImage$/ },
    others: [{ label: ".deb", match: /amd64\.deb$/ }],
    note: "Make the AppImage executable, then open it.",
  },
  {
    os: "Android",
    detail: "Android 8 and later",
    main: { label: "Google Play", url: PLAY_STORE_URL },
    others: [{ label: ".apk", match: /android\.apk$/ }],
    note: "Updates arrive through Google Play.",
  },
  {
    os: "iOS",
    detail: "iPhone and iPad",
    badge: "Soon",
    // The app builds for iOS; publishing it needs an Apple developer account, which sponsors would pay for.
    main: { label: "Sponsor on Ko-fi", url: SPONSOR.kofi ?? SPONSOR.page },
    others: [{ label: "other ways to sponsor", url: SPONSOR.page }],
    note: "Want it on iOS? Sponsor the App Store publish.",
  },
  {
    os: "Web",
    detail: "Nothing to install",
    badge: "Preview",
    main: { label: "Open the app", url: APP_URL },
    others: [],
    note: "Sign in with GitHub and pick a repository.",
  },
];

function size(bytes: number) {
  return `${Math.round(bytes / 1e6)} MB`;
}

function detectOs(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = `${nav.userAgentData?.platform ?? ""} ${nav.platform} ${nav.userAgent}`;
  if (/Android/i.test(nav.userAgent)) return "Android";
  if (/iPhone|iPad/i.test(nav.userAgent)) return "iOS";
  if (/mac/i.test(p)) return "macOS";
  if (/win/i.test(p)) return "Windows";
  if (/linux|x11/i.test(p)) return "Linux";
  return null;
}

/** One card per platform, wired to the files of the latest GitHub release. */
export function Downloads() {
  const { loading, release } = useRelease();
  const downloads = useDownloads();
  const [mine, setMine] = useState<Platform | null>(null);
  useEffect(() => setMine(detectOs()), []);

  const find = (match: RegExp): Asset | undefined => release?.assets.find((a) => match.test(a.name));
  const resolve = (o: Option): { href: string; size: string | null } | null => {
    if (o.url) return { href: o.url, size: null };
    const asset = o.match ? find(o.match) : undefined;
    return asset ? { href: asset.url, size: size(asset.size) } : null;
  };

  return (
    <div className="downloads">
      <p className="release-line">
        {loading ? (
          "Checking for the latest version…"
        ) : release ? (
          <>
            <strong>{release.version}</strong> · released{" "}
            {new Date(release.date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
            {downloads ? <>{downloads.toLocaleString("en")} downloads so far · </> : null}
            <a href={release.url}>What&apos;s new</a>
          </>
        ) : (
          <>
            <strong>The first release is on its way.</strong> Until then, build it from source below. It takes one command.
          </>
        )}
      </p>
      <div className="sync-band">
        <h3>Sync your notes across all your devices</h3>
        <p>Every device opens the same git repository, one you choose, and keeps it up to date in the background.</p>
      </div>
      <div className="platforms">
        {platforms.map((p) => {
          const main = resolve(p.main);
          const others = p.others.flatMap((o) => {
            const link = resolve(o);
            return link ? [{ label: o.label, ...link }] : [];
          });
          return (
            <div key={p.os} className={`platform${mine === p.os ? " mine" : ""}`}>
              <div className="platform-head">
                <OsIcon os={p.os} size={28} />
                {mine === p.os ? (
                  <span className="badge">Your system</span>
                ) : p.badge ? (
                  <span className="badge quiet">{p.badge}</span>
                ) : null}
              </div>
              <h3>{p.os}</h3>
              <p>{p.detail}</p>
              <p className="platform-note">{p.note}</p>
              <div className="platform-get">
                {main ? (
                  <a className="button primary" href={main.href}>
                    {p.main.label}
                    {main.size && <span className="file-size">{main.size}</span>}
                  </a>
                ) : (
                  <span className="button primary disabled" aria-disabled>
                    {p.main.label}
                  </span>
                )}
                <span className="platform-alt">
                  {others.map((o, i) => (
                    <span key={o.label}>
                      {i === 0 ? "or " : " · "}
                      <a href={o.href}>{o.label}</a>
                      {o.size && <span className="file-size"> {o.size}</span>}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="unsigned">
        macOS and Windows builds aren&apos;t code-signed yet, which is why the first launch asks you to confirm. Building from
        source avoids it. <a href={`${REPO}/releases`}>All releases</a>
      </p>
    </div>
  );
}
