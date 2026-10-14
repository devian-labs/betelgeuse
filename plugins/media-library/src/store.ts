/**
 * Media Library's live state: the library's status and scan progress (kept current through the
 * library's events), and requests to show a folder in the Library.
 */
import type { AssetKind, LibraryProgress, LibraryStatus } from "@betelgeuse/plugin-api";
import { useSyncExternalStore } from "react";
import { library } from "./host";

let status: LibraryStatus | null = null;
let progress: LibraryProgress = { phase: "idle" };
/** Bumped whenever the index changes, so open screens search again. */
let version = 0;
/** A folder the Library should show next (from "Show in Library" on a production). */
let request: { folder: string; at: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export async function refreshStudio() {
  status = await library()
    .status()
    .catch(() => status);
  version++;
  emit();
}

/** Starts following the library (called when the plugin activates). */
export function startStore() {
  let timer: number | undefined;
  refreshStudio();
  library().onChange(() => {
    // Probing saves every few seconds; one refresh per burst is plenty.
    window.clearTimeout(timer);
    timer = window.setTimeout(refreshStudio, 300);
  });
  library().onProgress((p) => {
    progress = p;
    emit();
    if (p.phase === "idle") refreshStudio();
  });
}

export function resetStore() {
  status = null;
  progress = { phase: "idle" };
  request = null;
}

/** Asks the Library to show a folder; the caller opens the Library. */
export function showInLibrary(folder: string) {
  request = { folder, at: Date.now() };
  emit();
}
export const useLibraryRequest = () => useSyncExternalStore(subscribe, () => request);

export function useStudio() {
  const s = useSyncExternalStore(subscribe, () => status);
  const p = useSyncExternalStore(subscribe, () => progress);
  const v = useSyncExternalStore(subscribe, () => version);
  return { status: s, progress: p, version: v };
}

export const KIND_LABELS: Record<AssetKind, string> = {
  video: "Video",
  audio: "Audio",
  image: "Images",
  raw: "Raw photos",
  design: "Design",
  project: "Projects",
  font: "Fonts",
  document: "Documents",
  other: "Other",
};

export const KIND_ORDER: AssetKind[] = ["video", "audio", "image", "raw", "design", "project", "font", "document", "other"];

export function formatDuration(s: number | null | undefined) {
  if (s == null || !isFinite(s)) return "";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** "4K", "1080p", or "1920×1080" for odd sizes. */
export function formatResolution(w: number | null, h: number | null) {
  if (!w || !h) return "";
  const short = Math.min(w, h);
  if (short >= 2100) return "4K";
  if ([2160, 1440, 1080, 720, 480].includes(short)) return `${short}p`;
  return `${w}×${h}`;
}
