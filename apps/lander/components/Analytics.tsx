"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Cookieless page views and download clicks, to PostHog: no cookies and nothing in the browser's storage
 * (PostHog counts unique visitors with a hash on its servers). It sends where a visitor came from (the
 * referrer and utm_ tags), the page, and the country. Only when NEXT_PUBLIC_POSTHOG_KEY is set; it goes
 * through /ingest on this site (vercel.json). Keep app/privacy/page.tsx in step with this file.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

type PostHog = (typeof import("posthog-js"))["default"];
let ready: Promise<PostHog> | null = null;

function posthog() {
  ready ??= import("posthog-js").then(({ default: ph }) => {
    ph.init(KEY!, {
      api_host: "/ingest",
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com",
      cookieless_mode: "always",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      person_profiles: "identified_only",
    });
    return ph;
  });
  return ready;
}

/** What a link is, for the clicks worth counting: a download (by OS and file), the web app, or GitHub. */
function classify(href: string): [string, Record<string, string>] | null {
  const download = href.match(/\/releases\/download\/([^/]+)\/(.+)$/);
  if (download) {
    const file = decodeURIComponent(download[2]);
    const os = /\.dmg$/.test(file) ? "macOS" : /\.(exe|msi)$/.test(file) ? "Windows" : /\.apk$/.test(file) ? "Android" : /\.(AppImage|deb|rpm)$/.test(file) ? "Linux" : "other";
    const arch = /aarch64|arm64/.test(file) ? "arm64" : /x64|amd64|x86_64/.test(file) ? "x64" : "";
    return ["download_clicked", { os, arch, format: file.split(".").pop() ?? "", version: download[1] }];
  }
  if (/^https:\/\/app\.betelgeuse\.pro/.test(href)) return ["web_app_clicked", { demo: String(/\/demo\b/.test(href)) }];
  if (/^https:\/\/github\.com\/devian-labs\/betelgeuse\/?$/.test(href)) return ["github_clicked", {}];
  if (/\/releases(\/latest)?\/?$/.test(href)) return ["releases_clicked", {}];
  return null;
}

export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (KEY) void posthog().then((ph) => ph.capture("$pageview"));
  }, [pathname]);
  useEffect(() => {
    if (!KEY) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const hit = a && classify(a.href);
      if (hit) void posthog().then((ph) => ph.capture(hit[0], { ...hit[1], from: location.pathname }, { transport: "sendBeacon" }));
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
