/**
 * Anonymous usage counts and error reports, both to PostHog, shared by the desktop, phone and web apps.
 *
 * - On by default, off with one switch (Settings → Privacy). Turning it off stops both at once.
 * - Does nothing unless the build has a key: VITE_POSTHOG_KEY (NEXT_PUBLIC_POSTHOG_KEY on the web). Release builds
 *   get it from CI secrets; a build from source, or a fork, sends nothing.
 * - Never sends what's in a workspace. No autocapture and no session recording (both would pick up page text),
 *   and everything that leaves goes through `scrub()` (./scrub.ts), which removes file paths, page and repository
 *   names, quoted text, tokens and email addresses. Keep apps/lander/app/privacy/page.tsx in step with this file.
 *
 * The SDK loads only once telemetry is on and configured, so it costs nothing otherwise.
 */
import { invoke, type PlatformKind } from "../platform";
import { scrub, scrubExceptions, scrubUrl } from "./scrub";
import { getSettings, onSettingsChange, updateSettings } from "./settings";

export type TelemetryConfig = {
  platform: PlatformKind;
  release: string;
  environment: string;
  posthogKey?: string;
  posthogHost?: string;
  /** Where PostHog's UI lives, when the API host is a proxy (for links in PostHog only). */
  posthogUiHost?: string;
};

type PostHog = (typeof import("posthog-js"))["default"];

let config: TelemetryConfig | null = null;
let posthog: PostHog | null = null;
let loading: Promise<void> | null = null;
let loaded = false;

const configured = () => !!config?.posthogKey;
export const telemetryEnabled = () => configured() && getSettings().telemetry;

/** Called once by each app, before it renders. Loads nothing when telemetry is off or unconfigured. */
export function initTelemetry(cfg: TelemetryConfig) {
  config = cfg;
  // Started: loading PostHog tells the Rust side too. Off: tell it now, so its crash reports stop as well.
  if (telemetryEnabled()) void start();
  else void native();
  // Errors anywhere in the page, from the moment the app starts.
  window.addEventListener("error", (e) => captureError(e.error ?? e.message, "window"));
  window.addEventListener("unhandledrejection", (e) => captureError(e.reason, "promise"));
  let was = getSettings().telemetry;
  onSettingsChange((s) => {
    if (s.telemetry === was) return;
    was = s.telemetry;
    if (s.telemetry && configured()) void start();
    else stop();
    void native();
  });
}

/**
 * The desktop and phone apps report their own crashes (Rust panics) too, under the same anonymous id,
 * and follow the same switch (crates/betelgeuse-core/src/telemetry.rs).
 */
async function native() {
  if (config?.platform === "web") return;
  if (telemetryEnabled()) await start();
  await invoke("set_crash_reports", { enabled: telemetryEnabled(), distinctId: posthog?.get_distinct_id() ?? null }).catch(() => {});
}

/** Once, on the first opening with telemetry on: `show` tells the person, and how to turn it off. */
export function noticeOnce(show: () => void) {
  if (!telemetryEnabled() || getSettings().telemetryNoticeSeen) return;
  updateSettings({ telemetryNoticeSeen: true });
  show();
}

function start(): Promise<void> {
  if (loaded) {
    // Turned back on after being turned off.
    if (posthog?.has_opted_out_capturing()) posthog.opt_in_capturing();
    return Promise.resolve();
  }
  loading ??= load().finally(() => {
    loaded = true;
    loading = null;
  });
  return loading;
}

function stop() {
  posthog?.opt_out_capturing();
}

async function load() {
  const cfg = config!;
  try {
    const { default: ph } = await import("posthog-js");
    ph.init(cfg.posthogKey!, {
      api_host: cfg.posthogHost || "https://us.i.posthog.com",
      ui_host: cfg.posthogUiHost,
      // Only the events this app sends on purpose: nothing read off the page. Errors are sent by
      // captureError(), so they go through the scrubbing below.
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      // An anonymous id in this app's storage, never a cookie; nobody is ever identified.
      persistence: "localStorage",
      person_profiles: "identified_only",
      before_send: (event) => {
        if (!event || !telemetryEnabled()) return null;
        const p = event.properties;
        for (const key of ["$current_url", "$referrer", "$initial_referrer", "$initial_current_url", "$session_entry_url", "$session_entry_referrer"]) {
          if (typeof p[key] === "string") p[key] = scrubUrl(p[key]);
        }
        for (const key of ["$pathname", "$initial_pathname", "$session_entry_pathname"]) {
          if (typeof p[key] === "string") p[key] = scrub(p[key]);
        }
        if (Array.isArray(p.$exception_list)) p.$exception_list = scrubExceptions(p.$exception_list);
        // The web app's tab title is the open page's title.
        delete p.$title;
        for (const set of [event.$set, event.$set_once]) {
          for (const key of Object.keys(set ?? {})) {
            if (/url|referrer|pathname|title/i.test(key)) delete set![key];
          }
        }
        return event;
      },
      loaded: (ph) => ph.register({ platform: cfg.platform, app_version: cfg.release, environment: cfg.environment }),
    });
    posthog = ph;
  } catch {
    // A blocked or failed load (ad blockers, offline) just means no telemetry.
  }
  if (cfg.platform !== "web") void native();
}

/** Counts something that happened. Properties must never hold content, names or paths. */
export function track(event: string, properties?: Record<string, string | number | boolean | null>) {
  if (!telemetryEnabled()) return;
  void start().then(() => posthog?.capture(event, properties));
}

/** Reports an error, scrubbed. `where` says which part of the app it came from. */
export function captureError(error: unknown, where?: string) {
  if (!telemetryEnabled() || error == null) return;
  void start().then(() => posthog?.captureException(error, where ? { where } : undefined));
}

/** A web-app route change, with the repository's names taken out of the URL. */
export function trackPageview() {
  if (!telemetryEnabled()) return;
  void start().then(() => posthog?.capture("$pageview", { $current_url: scrubUrl(location.href) }));
}

/** React 19 root options: uncaught render errors are reported (and still go to the console). */
export const reactRootOptions = {
  onUncaughtError: (error: unknown, info: { componentStack?: string }) => {
    console.error(error, info.componentStack);
    captureError(error, "react");
  },
};
