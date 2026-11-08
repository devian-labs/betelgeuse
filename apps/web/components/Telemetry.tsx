"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Starts usage counts and error reports for the web app (see packages/ui/src/lib/telemetry.ts), and counts
 * each route opened, with the repository's names taken out. Both go to PostHog through this site (/ingest),
 * so the content security policy still allows only this site, GitHub and Unsplash.
 */
export function Telemetry() {
  const pathname = usePathname();
  useEffect(() => {
    // Browser-only modules: the settings read the window's storage as they load.
    void import("@betelgeuse/ui/lib/telemetry").then((t) => {
      t.initTelemetry({
        platform: "web",
        release: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
        environment: process.env.NODE_ENV === "production" ? "production" : "development",
        posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        posthogHost: "/ingest",
        posthogUiHost: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com",
      });
    });
  }, []);
  useEffect(() => {
    void import("@betelgeuse/ui/lib/telemetry").then((t) => t.trackPageview());
  }, [pathname]);
  return null;
}
