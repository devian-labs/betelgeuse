import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Applies the saved (or system) theme and palette before the first paint, as on desktop.
import "@betelgeuse/ui/lib/settings";
import { installPlatform } from "@betelgeuse/ui/platform";
import { tauriPlatform } from "@betelgeuse/ui/platform/tauri";
import App from "./App";
import "./mobile.css";

installPlatform(tauriPlatform("mobile", { env: { dev: import.meta.env.DEV, unsplashKey: import.meta.env.VITE_UNSPLASH_ACCESS_KEY ?? "" } }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
