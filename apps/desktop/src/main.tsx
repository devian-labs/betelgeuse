import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// A file dropped where nothing handles it would make the webview navigate to it, replacing the app
// with no way back. Handlers that do accept files (the editor, the icon picker) call preventDefault first.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
}

// The webview's own context menu (Reload, Open Link, Inspect Element…) doesn't belong in the app.
// It stays only for editable text, where it brings Cut / Copy / Paste and spelling suggestions;
// links and images inside the editor are excluded since its "Open…" items navigate the webview.
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  const editable = t.isContentEditable || t.matches?.("input, textarea");
  if (!editable || t.closest("a, img")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
