import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitSettings } from "@desktop/lib/api";

export type SyncStatus = {
  configured: boolean;
  url: string | null;
  username: string | null;
  /** Milliseconds since 1970. */
  last_sync: number | null;
  /** Pages changed on this phone since the last sync. */
  changes: number;
  git: GitSettings | null;
};
export type SyncResult = { updated: boolean; conflicts: string[]; last_sync: number };
/** How far a download ("index" is unpacking what arrived) or upload has got. */
export type SyncProgress = { phase: "download" | "index" | "upload"; done: number; total: number; bytes: number };

export const syncApi = {
  status: () => invoke<SyncStatus>("sync_status"),
  connect: (p: { url: string; username: string; token: string; name: string; email: string }) => invoke<string>("sync_connect", p),
  now: () => invoke<SyncResult>("sync_now"),
  disconnect: () => invoke<void>("sync_disconnect"),
};

/** The latest transfer progress while `active`; null before the first report and once it stops. */
export function useSyncProgress(active: boolean): SyncProgress | null {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  useEffect(() => {
    if (!active) return setProgress(null);
    const off = listen<SyncProgress>("sync-progress", (e) => setProgress(e.payload));
    return () => void off.then((stop) => stop());
  }, [active]);
  return progress;
}

const PHASES = { download: "Downloading", index: "Unpacking", upload: "Uploading" };

/** "Downloading 42% · 71.3 MB" */
export function progressLabel(p: SyncProgress) {
  const percent = p.total > 0 ? ` ${Math.floor((p.done / p.total) * 100)}%` : "";
  const mb = p.bytes > 0 ? ` · ${(p.bytes / 1048576).toFixed(1)} MB` : "";
  return `${PHASES[p.phase]}${percent}${mb}`;
}

/** Open pages save what's typed before a sync, so it goes up with it. */
const savers = new Set<() => Promise<void>>();
export function registerSaver(save: () => Promise<void>) {
  savers.add(save);
  return () => void savers.delete(save);
}
const saveOpenPages = () => Promise.all([...savers].map((s) => s().catch(() => {})));

/** Sync again on its own after this long with the app open (to bring in other devices' changes). */
const EVERY = 2 * 60_000;
/** After an edit, sync once pages have been left alone this long (to send it to other devices). */
const QUIET = 20_000;
/** Coming back to the app syncs, unless the last sync was more recent than this. */
const STALE = 30_000;

export type Sync = {
  status: SyncStatus | null;
  syncing: boolean;
  error: string | null;
  /** Pulls and pushes now; `manual` shows what happened, even when nothing did. */
  sync: (manual?: boolean) => Promise<void>;
  reload: () => Promise<void>;
};

/**
 * Keeps the workspace in step with its repository: on launch, when the app comes back to the
 * front, when it goes to the background (so edits go up), every few minutes, and on demand.
 */
export function useSync({ onUpdated, onConflicts, onError }: { onUpdated: () => void; onConflicts: (paths: string[]) => void; onError: (message: string) => void }): Sync {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const handlers = useRef({ onUpdated, onConflicts, onError });
  handlers.current = { onUpdated, onConflicts, onError };
  const statusRef = useRef(status);
  statusRef.current = status;

  const reload = useCallback(async () => {
    const next = await syncApi.status().catch(() => null);
    statusRef.current = next; // a sync right after this reads it before the next render
    setStatus(next);
  }, []);

  const sync = useCallback(
    async (manual = false) => {
      if (running.current) return running.current;
      if (!statusRef.current?.configured) return;
      const run = (async () => {
        setSyncing(true);
        try {
          await saveOpenPages();
          const result = await syncApi.now();
          setError(null);
          if (result.updated) handlers.current.onUpdated();
          if (result.conflicts.length) handlers.current.onConflicts(result.conflicts);
        } catch (e) {
          const message = String(e);
          setError(message);
          if (manual) handlers.current.onError(message);
        } finally {
          setSyncing(false);
          running.current = null;
          await reload();
        }
      })();
      running.current = run;
      return run;
    },
    [reload],
  );

  // On launch.
  useEffect(() => {
    reload().then(() => sync());
  }, [reload, sync]);

  // Edits here go up soon after they stop; a sync's own changes don't count as edits.
  const lastEdit = useRef(0);
  useEffect(() => {
    let timer: number | undefined;
    const un = listen("vault-changed", () => {
      if (running.current) return;
      lastEdit.current = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync(), QUIET);
    });
    return () => {
      window.clearTimeout(timer);
      void un.then((f) => f());
    };
  }, [sync]);

  useEffect(() => {
    const onVisibility = () => {
      const last = statusRef.current?.last_sync ?? 0;
      if (document.visibilityState === "hidden") void sync();
      else if (Date.now() - last > STALE) void sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Every so often while open, but never while someone's typing.
    const timer = window.setInterval(() => document.visibilityState === "visible" && Date.now() - lastEdit.current > QUIET && void sync(), EVERY);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [sync]);

  return useMemo(() => ({ status, syncing, error, sync, reload }), [status, syncing, error, sync, reload]);
}
