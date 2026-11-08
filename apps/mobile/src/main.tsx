import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Applies the saved (or system) theme and palette before the first paint, as on desktop.
import "@betelgeuse/ui/lib/settings";
import { installPlatform } from "@betelgeuse/ui/platform";
import { tauriPlatform } from "@betelgeuse/ui/platform/tauri";
import { initTelemetry, reactRootOptions } from "@betelgeuse/ui/lib/telemetry";
import App from "./App";
import "./mobile.css";

installPlatform(tauriPlatform("mobile", { env: { dev: import.meta.env.DEV, unsplashKey: import.meta.env.VITE_UNSPLASH_ACCESS_KEY ?? "" } }));

// Anonymous usage counts and error reports: only in builds with keys, and off with Settings → Privacy.
initTelemetry({
  platform: "mobile",
  release: import.meta.env.VITE_APP_VERSION,
  environment: import.meta.env.DEV ? "development" : "production",
  posthogKey: import.meta.env.VITE_POSTHOG_KEY,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST,
});

createRoot(document.getElementById("root")!, reactRootOptions).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
