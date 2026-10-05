import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

/** "black" is dark mode with true-black surfaces. */
export type Mode = "system" | "light" | "dark" | "black";
export type Palette = "betelgeuse" | "graphite" | "midnight";
export type TextSize = "small" | "default" | "large";

export type Settings = {
  mode: Mode;
  palette: Palette;
  accent: string;
  textSize: TextSize;
  /** Seconds of quiet before auto-committing; 0 turns it off. */
  autocommit: number;
  /** Mark pages hidden from (or, in share-only mode, not shared with) AI agents in the sidebar. */
  sidebarAiBadges: boolean;
  /** How many Recents rows the sidebar shows; its height stays fixed at this many. */
  recentRows: number;
};

export const ACCENTS: { id: string; label: string; color: string }[] = [
  { id: "ember", label: "Ember", color: "#e2582b" },
  { id: "blue", label: "Blue", color: "#2383e2" },
  { id: "violet", label: "Violet", color: "#7c5cff" },
  { id: "emerald", label: "Emerald", color: "#10a37f" },
  { id: "rose", label: "Rose", color: "#e0457b" },
  { id: "amber", label: "Amber", color: "#d98a0b" },
];

export const PALETTES: { id: Palette; label: string; hint: string; swatch: [string, string, string] }[] = [
  { id: "betelgeuse", label: "Betelgeuse", hint: "Warm ember neutrals", swatch: ["#1b1715", "#221d1a", "#e2582b"] },
  { id: "graphite", label: "Graphite", hint: "Neutral greys", swatch: ["#191919", "#202020", "#9b9b9b"] },
  { id: "midnight", label: "Midnight", hint: "Cool blue slate", swatch: ["#13161d", "#191d26", "#5b7cfa"] },
];

const DEFAULTS: Settings = { mode: "system", palette: "betelgeuse", accent: "ember", textSize: "default", autocommit: 8, sidebarAiBadges: false, recentRows: 5 };
const KEY = "betelgeuse-settings";

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* settings still apply for this session */
  }
  apply();
  if ("autocommit" in patch) api.setAutocommit(current.autocommit).catch(() => {});
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** Writes the appearance settings onto <html> as data attributes and the accent variable. */
function apply() {
  const root = document.documentElement;
  const dark = current.mode === "dark" || current.mode === "black" || (current.mode === "system" && systemDark());
  root.dataset.theme = dark ? "dark" : "light";
  if (current.mode === "black") root.dataset.black = "";
  else delete root.dataset.black;
  root.dataset.palette = current.palette;
  root.dataset.text = current.textSize;
  root.style.setProperty("--blue", ACCENTS.find((a) => a.id === current.accent)?.color ?? ACCENTS[0].color);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Applies settings at startup and follows the OS theme while in System mode. */
export function useApplySettings() {
  useEffect(() => {
    apply();
    api.setAutocommit(current.autocommit).catch(() => {});
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => current.mode === "system" && apply();
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, []);
}

// Apply before React renders to avoid a flash of the wrong theme.
apply();
