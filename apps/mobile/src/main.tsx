import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Applies the saved (or system) theme and palette before the first paint, as on desktop.
import "@desktop/lib/settings";
import App from "./App";
import "./mobile.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
