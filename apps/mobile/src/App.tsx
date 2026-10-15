import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadIcons } from "@desktop/components/PageIcon";
import { Toast, type ToastData } from "@desktop/components/Toast";
import { api, type NoteMeta } from "@desktop/lib/api";
import { joinNote, patchFrontmatter, splitNote } from "@desktop/lib/frontmatter";
import { planReorder } from "@desktop/lib/order";
import { updateSettings } from "@desktop/lib/settings";
import { buildTree, childrenOf } from "@desktop/lib/tree";
import { VaultContext, type VaultContextValue } from "@desktop/lib/vault";
import { MobileContext, titleOf, type MobileApp, type Route } from "./mobile";
import { Home } from "./Home";
import { FAVORITES, readList, RECENTS, remapPaths, within, writeList } from "./lists";
import { MoveSheet, PageActionsSheet } from "./PageSheets";
import { PageScreen } from "./PageScreen";
import { SearchScreen } from "./SearchScreen";
import { SettingsScreen } from "./SettingsScreen";
import { PluginScreen, PluginSettingsScreen, PluginsScreen, usePluginRuntime } from "./plugins";
import { useSync } from "./sync";
import { SyncScreen } from "./SyncScreen";
import { TrashScreen } from "./TrashScreen";

const HOME: Route = { name: "home" };
let screenIds = 0;

/**
 * The page list (Home) with the other screens stacked on it. Each screen opened pushes a browser
 * history entry, so the Android back button and the iOS edge swipe go back the way people expect.
 */
export default function App() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [route, setRoute] = useState<Route>(HOME);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState(() => readList(FAVORITES));
  const [recents, setRecents] = useState(() => readList(RECENTS));
  const [toast, setToast] = useState<ToastData | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const routeRef = useRef(route);
  routeRef.current = route;
  /** A page's name (several pages may share one), falling back to its file name. */
  // Stable, so the toast's timer isn't restarted by every render (it'd never close).
  const closeToast = useCallback(() => setToast(null), []);
  const nameOf = (path: string) => notesRef.current.find((n) => n.path === path)?.title ?? titleOf(path);

  const refresh = useCallback(async () => {
    const n = await api.listNotes();
    setNotes(n);
    setRefreshKey((k) => k + 1);
    return n;
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    // Page icons drawn from the icon set (rather than emoji) need it loaded.
    void loadIcons();
  }, [refresh]);

  useEffect(() => writeList(FAVORITES, favorites), [favorites]);
  useEffect(() => writeList(RECENTS, recents), [recents]);
  // Every page opened goes to the top of Recents.
  useEffect(() => {
    if (route.name === "page") setRecents((r) => [route.path, ...r.filter((p) => p !== route.path)].slice(0, 10));
  }, [route]);

  // Follow the phone's light / dark setting while the theme is "System".
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => updateSettings({});
    mq?.addEventListener("change", onChange);
    return () => mq?.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    window.history.replaceState({ route: HOME }, "");
    const onPop = (e: PopStateEvent) => setRoute((e.state as { route?: Route } | null)?.route ?? HOME);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((next: Route) => {
    if (next.name === "page") next = { ...next, id: ++screenIds };
    // Opened from a sheet: the screen takes the sheet's history entry, so one Back returns from it.
    if (window.history.state?.sheets) window.history.replaceState({ route: next }, "");
    else window.history.pushState({ route: next }, "");
    setRoute(next);
  }, []);
  const back = useCallback(() => {
    if (window.history.state?.route && window.history.state.route.name !== "home") window.history.back();
    else setRoute(HOME);
  }, []);
  /** Swaps the current screen without adding a step to Back (a renamed or moved page). */
  const replace = useCallback((next: Route) => {
    window.history.replaceState({ ...window.history.state, route: next }, "");
    setRoute(next);
  }, []);
  const openPage = useCallback((path: string) => go({ name: "page", path }), [go]);

  /** Writes `order` values into pages' frontmatter (null removes it). */
  const writeOrders = async (writes: Record<string, number | null>) => {
    for (const [page, order] of Object.entries(writes)) {
      const { frontmatter, body } = splitNote(await api.readNote(page));
      await api.writeNote(page, joinNote(patchFrontmatter(frontmatter, { order }), body));
    }
  };

  // A new page goes last among its siblings, as on the desktop, instead of wherever its title sorts.
  const createPage = useCallback(
    async (parent: string | null, title = "Untitled") => {
      const path = await api.createNote(parent, title);
      const siblings = childrenOf(buildTree(await api.listNotes()), parent?.replace(/\.md$/, "") ?? "");
      const writes = planReorder(
        siblings.map((s) => ({ path: s.path, order: s.order ?? null })),
        path,
        siblings.length,
      );
      if (Object.keys(writes).length) await writeOrders(writes).catch(() => {});
      await refresh();
      return path;
    },
    [refresh],
  );

  usePluginRuntime({ go, toast: (message) => setToast({ message }), refresh: () => void refresh() });

  const sync = useSync({
    // Pages arrived or changed: the list, and any page on screen, catch up.
    onUpdated: () => void refresh(),
    onConflicts: (paths) =>
      setToast({
        message:
          paths.length === 1
            ? `“${nameOf(paths[0])}” changed here and elsewhere: both versions kept`
            : `${paths.length} pages changed here and elsewhere: both versions kept`,
      }),
    onError: (message) => setToast({ message: `Couldn't sync: ${message}` }),
  });

  const renamed = useCallback(
    async (from: string, to: string) => {
      if (from === to) return;
      setRecents((r) => remapPaths(r, from, to));
      setFavorites((f) => remapPaths(f, from, to));
      const r = routeRef.current;
      if (r.name === "page" && within(r.path, from)) replace({ ...r, path: remapPaths([r.path], from, to)[0] });
      await refresh();
    },
    [refresh, replace],
  );

  const mobile = useMemo<MobileApp>(
    () => ({
      favorites,
      recents,
      go,
      back,
      newPage: async (title) => {
        // New pages go to the Inbox, if there is one, to be sorted later.
        const inbox = notesRef.current.find((n) => n.path === "Inbox.md");
        openPage(await createPage(inbox ? "Inbox.md" : null, title));
      },
      toggleFavorite: (path) => setFavorites((f) => (f.includes(path) ? f.filter((x) => x !== path) : [...f, path])),
      deletePage: async (path) => {
        const name = nameOf(path);
        const id = await api.deleteNote(path);
        setFavorites((f) => f.filter((x) => !within(x, path)));
        const r = routeRef.current;
        if (r.name === "page" && within(r.path, path)) back();
        await refresh();
        setToast({
          message: `Moved “${name}” to Trash`,
          action: {
            label: "Undo",
            run: async () => {
              const restored = await api.restoreTrash(id);
              await refresh();
              openPage(restored);
            },
          },
        });
      },
      duplicatePage: async (path) => {
        const copy = await api.duplicateNote(path);
        await refresh();
        openPage(copy);
      },
      movePage: async (path, dest) => {
        const next = await api.moveNote(path, dest);
        // Its place among its old siblings means nothing in the new folder: it goes last there.
        if (notesRef.current.find((n) => n.path === path)?.order != null) await writeOrders({ [next]: null }).catch(() => {});
        await renamed(path, next);
        setToast({ message: `Moved to ${dest ? nameOf(`${dest}.md`) : "the top level"}` });
      },
      pageActions: setActionsFor,
      moveSheet: setMoving,
      toast: setToast,
      sync,
      renamed,
    }),
    [favorites, recents, go, back, openPage, createPage, refresh, renamed, sync],
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
      renamed,
      // AI agents reach a workspace through the desktop app's MCP server, not the phone.
      aiPolicy: "all",
      setPageAi: async () => {},
    }),
    [notes, refreshKey, openPage, createPage, refresh, renamed],
  );

  if (error) {
    return <div className="safe-top grid h-full place-items-center bg-surface p-6 text-center text-sm text-muted">Couldn't open your workspace: {error}</div>;
  }

  return (
    <VaultContext.Provider value={vault}>
      <MobileContext.Provider value={mobile}>
        <div className="h-full bg-surface text-ink">
          {/* Home stays mounted under the other screens, keeping its open folders and scroll position. */}
          <div className={route.name === "home" ? "h-full" : "hidden"}>
            <Home />
          </div>
          {route.name === "page" && <PageScreen key={route.id ?? route.path} path={route.path} />}
          {route.name === "search" && <SearchScreen />}
          {route.name === "settings" && <SettingsScreen />}
          {route.name === "sync" && <SyncScreen />}
          {route.name === "trash" && <TrashScreen />}
          {route.name === "plugin" && <PluginScreen key={route.path} path={route.path} />}
          {route.name === "plugins" && <PluginsScreen />}
          {route.name === "plugin-settings" && <PluginSettingsScreen key={route.key} sectionKey={route.key} />}
        </div>
        {actionsFor && <PageActionsSheet path={actionsFor} onClose={() => setActionsFor(null)} />}
        {moving && <MoveSheet path={moving} onClose={() => setMoving(null)} />}
        {toast && <Toast {...toast} onClose={closeToast} />}
      </MobileContext.Provider>
    </VaultContext.Provider>
  );
}
