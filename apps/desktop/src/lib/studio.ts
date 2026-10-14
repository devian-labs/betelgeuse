import { listen } from "@tauri-apps/api/event";
import { useEffect, useSyncExternalStore } from "react";
import { api, type AssetKind, type LibraryStatus } from "./api";

/** Tabs show the Library when their "path" is this (pages always end in `.md`). */
export const LIBRARY_PATH = "@library";

export type Progress = { phase: "idle" | "scanning" | "probing"; done?: number; total?: number };

let status: LibraryStatus | null = null;
/** A folder the Library should show next (from "Show in Library" on a production). */
let request: { folder: string; at: number } | null = null;
let progress: Progress = { phase: "idle" };
/** Bumped whenever the index changes, so open Library views search again. */
let version = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function refreshStudio() {
  status = await api.libraryStatus().catch(() => status);
  version++;
  emit();
}

let started = false;
function start() {
  if (started) return;
  started = true;
  refreshStudio();
  let timer: number | undefined;
  listen("library-changed", () => {
    // Probing saves every few seconds; one refresh per burst is plenty.
    window.clearTimeout(timer);
    timer = window.setTimeout(refreshStudio, 300);
  });
  listen<Progress>("library-progress", (e) => {
    progress = e.payload;
    emit();
    if (e.payload.phase === "idle") refreshStudio();
  });
}

const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Asks the Library to show a folder; the caller opens the Library tab. */
export function showInLibrary(folder: string) {
  request = { folder, at: Date.now() };
  emit();
}
export const useLibraryRequest = () => useSyncExternalStore(subscribe, () => request);

export function useStudio() {
  const s = useSyncExternalStore(subscribe, () => status);
  const p = useSyncExternalStore(subscribe, () => progress);
  const v = useSyncExternalStore(subscribe, () => version);
  return { status: s, enabled: !!s?.settings.enabled, progress: p, version: v };
}

/** Reloads Creator Studio's state when the workspace changes. */
export function useStudioWorkspace(workspace: string | undefined) {
  useEffect(() => {
    if (workspace) refreshStudio();
  }, [workspace]);
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

// Thumbnails, loaded once per session and shared by every view.
const thumbs = new Map<string, Promise<string | null>>();
export function thumbnailUrl(id: string, modified: number): Promise<string | null> {
  const key = `${id}@${modified}`;
  let p = thumbs.get(key);
  if (!p) {
    p = api
      .libraryThumbnail(id)
      .then((buf) => (buf.byteLength ? URL.createObjectURL(new Blob([buf])) : null))
      .catch(() => null);
    thumbs.set(key, p);
  }
  return p;
}
export const forgetThumbnails = () => thumbs.clear();
