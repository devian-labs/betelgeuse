import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type NoteMeta } from "@desktop/lib/api";
import { updateSettings } from "@desktop/lib/settings";
import { VaultContext, type VaultContextValue } from "@desktop/lib/vault";
import { Home } from "./Home";
import { PageScreen } from "./PageScreen";

/**
 * Two screens: the page list, and a page. Opening a page pushes a browser history entry, so the
 * Android back button and the iOS edge swipe go back the way people expect.
 */
export default function App() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const refresh = useCallback(async () => {
    const n = await api.listNotes();
    setNotes(n);
    setRefreshKey((k) => k + 1);
    return n;
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  // Follow the phone's light / dark setting while the theme is "System".
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => updateSettings({});
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => setPath((e.state as { path?: string } | null)?.path ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openPage = useCallback((next: string) => {
    window.history.pushState({ path: next }, "");
    setPath(next);
    window.scrollTo(0, 0);
  }, []);

  const back = useCallback(() => {
    if (window.history.state?.path) window.history.back();
    else setPath(null);
  }, []);

  const createPage = useCallback(
    async (parent: string | null, title = "Untitled") => {
      const created = await api.createNote(parent, title);
      await refresh();
      return created;
    },
    [refresh],
  );

  const vault = useMemo<VaultContextValue>(
    () => ({
      notes,
      refreshKey,
      openPage,
      // A phone has no room for a side panel: database rows open as full pages.
      peek: openPage,
      createPage,
      refresh,
      aiPolicy: "all",
      setPageAi: async () => {},
    }),
    [notes, refreshKey, openPage, createPage, refresh],
  );

  if (error) {
    return <div className="safe-top grid h-full place-items-center bg-surface p-6 text-center text-sm text-muted">Couldn't open your workspace: {error}</div>;
  }

  return (
    <VaultContext.Provider value={vault}>
      <div className="h-full bg-surface text-ink">
        {path ? (
          <PageScreen
            key={path}
            path={path}
            onBack={back}
            onDeleted={() => (back(), refresh())}
            // A rename moves the file; show it at its new path without adding a step to Back.
            onRenamed={(moved) => (window.history.replaceState({ path: moved }, ""), setPath(moved))}
          />
        ) : (
          <Home
            onNew={async () => {
              // New pages go to the Inbox, if there is one, to be sorted later.
              const inbox = notesRef.current.find((n) => n.path === "Inbox.md");
              openPage(await createPage(inbox ? "Inbox.md" : null));
            }}
          />
        )}
      </div>
    </VaultContext.Provider>
  );
}
