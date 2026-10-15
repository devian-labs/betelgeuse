import { listen } from "@tauri-apps/api/event";
import { message, open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentsDialog } from "./components/AgentsDialog";
import { SettingsDialog, type Section } from "./components/SettingsDialog";
import { CommandPalette } from "./components/CommandPalette";
import { HistoryPanel } from "./components/HistoryPanel";
import { loadWorkspace as loadPlugins, parseViewPath, setHost as setPluginHost, viewPath } from "./plugins/runtime";
import { PluginView } from "./plugins/slots";
import { Logo } from "./components/Logo";
import { Toast, type ToastData } from "./components/Toast";
import { PageView } from "./components/PageView";
import { TabBar } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { api, type AiPolicy, type NoteMeta, type RepoStatus, type VaultInfo } from "./lib/api";
import { aiAccess } from "./lib/ai";
import { wantsNewTab, type OpenOptions } from "./lib/nav";
import { joinNote, patchFrontmatter, splitNote } from "./lib/frontmatter";
import { planReorder } from "./lib/order";
import { ancestorKeys, buildTree, childrenOf, parentPath } from "./lib/tree";
import { isQuietWrite } from "./lib/quiet";
import { loadIcons } from "./components/PageIcon";
import { VaultContext, type VaultContextValue } from "./lib/vault";
import { useFullscreen } from "./lib/window";
import { useApplySettings } from "./lib/settings";

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* per-viewer convenience only */
    }
  },
};

const readList = (k: string): string[] => {
  try {
    return JSON.parse(store.get(k) ?? "[]");
  } catch {
    return [];
  }
};

/** An open tab: its own back/forward history (⌘[ and ⌘]), like a browser tab. */
type Tab = { id: number; stack: string[]; index: number };
type Tabs = { list: Tab[]; active: number };
let tabIds = 0;
const newTab = (path: string): Tab => ({ id: ++tabIds, stack: [path], index: 0 });
const current = (t: Tab | undefined) => (t ? t.stack[t.index] : null);
/** Applies `f` to the active tab. */
const withActive = (t: Tabs, f: (tab: Tab) => Tab): Tabs => ({ ...t, list: t.list.map((tab, i) => (i === t.active ? f(tab) : tab)) });

const RECENTS = 10;

export default function App() {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [tabs, setTabs] = useState<Tabs>({ list: [], active: 0 });
  const openPath = current(tabs.list[tabs.active]);
  /** The open page, when the tab shows one (not the Library). */
  const pagePath = openPath?.startsWith("@plugin/") ? undefined : openPath;
  const [recents, setRecents] = useState<string[]>([]);
  const [peekPath, setPeekPath] = useState<string | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The sidebar opens fully collapsed; only the arrows (and adding or dragging a page into
  // another) expand it.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [favorites, setFavorites] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [aiPolicy, setAiPolicyState] = useState<AiPolicy>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [palette, setPalette] = useState(false);
  const [agents, setAgents] = useState(false);
  const [history, setHistory] = useState(false);
  const [sidebar, setSidebar] = useState(() => store.get("sidebar") !== "hidden");
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const fullscreen = useFullscreen();
  useApplySettings();
  const [settings, setSettings] = useState<false | Section>(false);
  // Plugins: load the ones this workspace uses, and lend them navigation and messages.
  useEffect(() => {
    if (vault) loadPlugins(vault.path);
  }, [vault]);
  // The icon set loads on demand; fetch it once the app has settled, so page icons are ready.
  useEffect(() => {
    const t = window.setTimeout(() => void loadIcons(), 1500);
    return () => window.clearTimeout(t);
  }, []);
  const lastSyncError = useRef<string | null>(null);
  // Back at the window after a while: catch up with the other devices.
  useEffect(() => {
    const onFocus = () => void api.gitSyncSoon().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const vaultRef = useRef(vault);
  vaultRef.current = vault;

  const refresh = useCallback(async () => {
    const [n, s] = await Promise.all([api.listNotes(), api.gitStatus().catch(() => null)]);
    // Keep what didn't change, so a refresh that changes nothing re-renders nothing.
    const next = reconcileNotes(notesRef.current, n);
    setNotes(next);
    setStatus((old) => (JSON.stringify(old) === JSON.stringify(s) ? old : s));
    return next;
  }, []);

  const openVault = useCallback(
    async (info: VaultInfo) => {
      // Recents come from a file first: it outlives a crash or force-quit, where the webview's storage
      // may not. Read before any state is set, so the save effect never writes over it with stale data.
      const recentsFile = await api.uiStateGet(`recents:${info.path}`).catch(() => null);
      const fromFile = (() => {
        try {
          const list: unknown = recentsFile ? JSON.parse(recentsFile) : null;
          return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : null;
        } catch {
          return null;
        }
      })();
      setVault(info);
      setFavorites(readList(`favorites:${info.path}`));
      setRecents(fromFile ?? readList(`recents:${info.path}`));
      api.getAiPolicy().then(setAiPolicyState).catch(() => {});
      const n = await refresh();
      const exists = (p: string) => n.some((x) => x.path === p);
      // Reopen the tabs from last time (each with just its page; back/forward history isn't kept).
      // Library tabs from before the Media Library plugin ("@library") and its first name (creator-studio).
      const saved = readList(`tabs:${info.path}`)
        .map((p) => (p === "@library" || p === "@plugin/creator-studio/library" ? "@plugin/media-library/library" : p))
        .filter((p) => p.startsWith("@plugin/") || exists(p));
      const last = store.get(`open:${info.path}`);
      const first = [last, n.find((x) => x.title === "Welcome")?.path, n[0]?.path].find((p): p is string => !!p && exists(p));
      const paths = saved.length ? saved : first ? [first] : [];
      const active = Math.max(0, paths.indexOf(last ?? ""));
      setTabs({ list: paths.map(newTab), active });
    },
    [refresh],
  );

  useEffect(() => {
    api.currentVault().then(openVault).catch((e) => setError(String(e)));
  }, [openVault]);

  // Files changed on disk: our own saves, agents over MCP, git, other editors.
  useEffect(() => {
    let timer: number | undefined;
    const unlisten = [
      listen<string[]>("vault-changed", (e) => {
        // Typing saves (see lib/quiet) only need one catch-up refresh once the typing pauses.
        const root = vaultRef.current?.path ?? "";
        const quiet = e.payload.every((p) => isQuietWrite(p.startsWith(root) ? p.slice(root.length + 1) : p));
        window.clearTimeout(timer);
        timer = window.setTimeout(
          () => {
            refresh();
            setRefreshKey((k) => k + 1);
          },
          quiet ? 3000 : 250,
        );
      }),
      listen("git-committed", () => refresh()),
      // A background sync: pages it brought in show straight away; trouble is said once, not every round.
      listen<{ updated: boolean; conflicts: string[] }>("git-synced", (e) => {
        lastSyncError.current = null;
        refresh();
        if (e.payload.updated) setRefreshKey((k) => k + 1);
        const n = e.payload.conflicts.length;
        if (n) setToast({ message: n === 1 ? `“${e.payload.conflicts[0].replace(/^.*\//, "").replace(/\.md$/, "")}” changed here and elsewhere: both versions kept` : `${n} pages changed here and elsewhere: both versions kept` });
      }),
      listen<string>("git-sync-failed", (e) => {
        if (lastSyncError.current === e.payload) return;
        lastSyncError.current = e.payload;
        setToast({ message: `Couldn't sync: ${e.payload.split("\n")[0]}` });
      }),
    ];
    return () => unlisten.forEach((u) => u.then((f) => f()));
  }, [refresh]);

  useEffect(() => {
    if (vault && openPath) store.set(`open:${vault.path}`, openPath);
  }, [vault, openPath]);
  useEffect(() => {
    if (vault) store.set(`tabs:${vault.path}`, JSON.stringify(tabs.list.map(current)));
  }, [vault, tabs]);
  useEffect(() => {
    if (!vault) return;
    store.set(`recents:${vault.path}`, JSON.stringify(recents));
    api.uiStateSet(`recents:${vault.path}`, JSON.stringify(recents)).catch(() => {});
  }, [vault, recents]);
  // Every page shown goes to the top of Recents.
  useEffect(() => {
    if (pagePath) setRecents((r) => [pagePath, ...r.filter((x) => x !== pagePath)].slice(0, RECENTS));
  }, [pagePath]);
  useEffect(() => store.set("sidebar", sidebar ? "shown" : "hidden"), [sidebar]);
  useEffect(() => {
    if (vault) store.set(`favorites:${vault.path}`, JSON.stringify(favorites));
  }, [vault, favorites]);

  // Opening a page closes the peek panel; the sidebar stays as the user left it.
  const reveal = useCallback((_path: string) => setPeekPath(null), []);

  // Opens a page in the current tab (browser-style back/forward), or a new
  // tab next to it. With no tab open yet, the page gets the first one.
  const openPage = useCallback(
    (path: string, opts?: OpenOptions) => {
      reveal(path);
      setTabs((t) => {
        if (!t.list.length) return { list: [newTab(path)], active: 0 };
        if (opts?.newTab) return { list: [...t.list.slice(0, t.active + 1), newTab(path), ...t.list.slice(t.active + 1)], active: t.active + 1 };
        return withActive(t, (tab) => (current(tab) === path ? tab : { ...tab, stack: [...tab.stack.slice(0, tab.index + 1), path], index: tab.index + 1 }));
      });
    },
    [reveal],
  );
  useEffect(() => {
    setPluginHost({ openPath: openPage, toast: (message) => setToast({ message }), openSettings: (section) => setSettings(section as Section) });
  }, [openPage]);

  const activeTab = tabs.list[tabs.active];
  const go = useCallback(
    (delta: number) => {
      const index = (activeTab?.index ?? 0) + delta;
      if (!activeTab || index < 0 || index >= activeTab.stack.length) return;
      reveal(activeTab.stack[index]);
      setTabs((t) => withActive(t, (tab) => ({ ...tab, index })));
    },
    [activeTab, reveal],
  );

  const selectTab = (i: number) => {
    const path = current(tabs.list[i]);
    if (path) reveal(path);
    setTabs((t) => ({ ...t, active: i }));
  };
  const closeTab = (i: number) =>
    setTabs((t) => {
      if (t.list.length < 2) return t;
      const list = t.list.filter((_, k) => k !== i);
      // Closing the active tab moves to its right-hand neighbour (or the new last tab), like a browser.
      const active = i < t.active || (i === t.active && t.active === list.length) ? t.active - 1 : t.active;
      return { list, active: Math.max(0, Math.min(active, list.length - 1)) };
    });

  /** Keeps only the tabs `keep` accepts (by index), making tab `i` the active one. */
  const keepTabs = (i: number, keep: (k: number) => boolean) =>
    setTabs((t) => {
      const list = t.list.filter((_, k) => keep(k));
      return { list, active: list.indexOf(t.list[i]) };
    });

  /** Writes `order` values into pages' frontmatter (null removes it). */
  const writeOrders = async (writes: Record<string, number | null>) => {
    for (const [page, order] of Object.entries(writes)) {
      const { frontmatter, body } = splitNote(await api.readNote(page));
      await api.writeNote(page, joinNote(patchFrontmatter(frontmatter, { order }), body));
    }
  };

  // A new page goes last among its siblings, or right below `after`, instead of wherever its
  // title happens to sort.
  const createPage = useCallback(
    async (parent: string | null, title = "Untitled", after?: string) => {
      const path = await api.createNote(parent, title);
      const siblings = childrenOf(buildTree(await refresh()), parent?.replace(/\.md$/, "") ?? "");
      const at = after ? siblings.findIndex((s) => s.path === after) : -1;
      const writes = planReorder(
        siblings.map((s) => ({ path: s.path, order: s.order ?? null })),
        path,
        at >= 0 ? at + 1 : siblings.length,
      );
      if (Object.keys(writes).length) {
        await writeOrders(writes).catch(() => {});
        await refresh();
        setRefreshKey((k) => k + 1);
      }
      if (parent) setExpanded((prev) => new Set([...prev, parent.replace(/\.md$/, "")]));
      return path;
    },
    [refresh],
  );
  /** A new page next to the open one (same parent, right below it), or at the top level. */
  const createHere = useCallback(
    (title?: string) => createPage(pagePath ? parentPath(pagePath) : null, title, pagePath ?? undefined),
    [createPage, pagePath],
  );

  // Deleting moves to the Trash right away, with an Undo toast.
  const deletePage = useCallback(
    async (path: string) => {
      const title = notesRef.current.find((n) => n.path === path)?.title ?? path.split("/").pop()!.replace(/\.md$/, "");
      const id = await api.deleteNote(path);
      const n = await refresh();
      setFavorites((f) => f.filter((x) => x !== path && !x.startsWith(path.replace(/\.md$/, "/"))));
      if (peekPath === path) setPeekPath(null);
      // Tabs showing a deleted page close; the last one moves to the first page left.
      setTabs((t) => {
        const alive = t.list.filter((tab) => n.some((x) => x.path === current(tab)));
        if (alive.length === t.list.length) return t;
        if (!alive.length) return { list: n[0] ? [newTab(n[0].path)] : [], active: 0 };
        const keep = alive.indexOf(t.list[t.active]);
        return { list: alive, active: keep >= 0 ? keep : Math.min(t.active, alive.length - 1) };
      });
      setToast({
        message: `Moved “${title}” to Trash`,
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
    [refresh, peekPath, openPage],
  );

  const toggleFavorite = (path: string) => setFavorites((f) => (f.includes(path) ? f.filter((x) => x !== path) : [...f, path]));

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      await message(String(e), { title: "Betelgeuse", kind: "error" });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  // A click outside the peek panel closes it (menus and dialogs it opened don't count). It waits
  // for the click to finish: a click on another row peeks that row instead, and closing first
  // would make the panel slide out and back in.
  const peekRef = useRef(peekPath);
  peekRef.current = peekPath;
  useEffect(() => {
    if (!peekPath) return;
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (e.button !== 0 || t.closest?.(".peek-panel, [data-popover], .fixed")) return;
      const shown = peekRef.current;
      window.addEventListener(
        "mouseup",
        () => setTimeout(() => peekRef.current === shown && setPeekPath(null)),
        { once: true },
      );
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [peekPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && peekPath && !document.querySelector("[data-popover]")) setPeekPath(null);
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") (e.preventDefault(), setPalette((v) => !v));
      if (key === "n" && !e.altKey) (e.preventDefault(), createHere().then(openPage));
      if (key === "\\") (e.preventDefault(), setSidebar((v) => !v), setSidebarPeek(false));
      if (key === "s") (e.preventDefault(), run("Committing…", () => api.gitCommit()));
      if (key === ",") (e.preventDefault(), setSettings("appearance"));
      if (key === "[") (e.preventDefault(), go(-1));
      if (key === "]") (e.preventDefault(), go(1));
      // Next / previous tab: Ctrl-Tab and Ctrl-Shift-Tab, like a browser.
      if (e.key === "Tab" && e.ctrlKey && tabs.list.length > 1) {
        e.preventDefault();
        selectTab((tabs.active + (e.shiftKey ? tabs.list.length - 1 : 1)) % tabs.list.length);
      }
      if (key === "t" && !e.shiftKey && openPath) (e.preventDefault(), openPage(openPath, { newTab: true }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setPageAi = useCallback(
    async (path: string, visible: boolean) => {
      const inherited = aiAccess(path, notesRef.current.map((n) => (n.path === path ? { ...n, ai: null } : n)), aiPolicy);
      // Write the smallest override: nothing if the page would already be in the wanted state without one.
      const value = inherited.visible === visible ? null : visible;
      const { frontmatter, body } = splitNote(await api.readNote(path));
      await api.writeNote(path, joinNote(patchFrontmatter(frontmatter, { ai: value }), body));
      await refresh();
    },
    [aiPolicy, refresh],
  );

  // Dragging a page in the sidebar: write the few `order` values that put it where it was dropped.
  const reorderPage = useCallback(
    async (path: string, siblings: string[], gap: number) => {
      const byPath = new Map(notesRef.current.map((n) => [n.path, n]));
      const writes = planReorder(siblings.map((s) => ({ path: s, order: byPath.get(s)?.order ?? null })), path, gap);
      if (!Object.keys(writes).length) return;
      // Re-sort right away; the files follow.
      setNotes((ns) => ns.map((n) => (n.path in writes ? { ...n, order: writes[n.path] } : n)));
      try {
        await writeOrders(writes);
      } catch (e) {
        await message(String(e), { title: "Betelgeuse", kind: "error" });
      } finally {
        await refresh();
        // An open page picks up its new frontmatter instead of saving over it.
        setRefreshKey((k) => k + 1);
      }
    },
    [refresh],
  );

  // Dragging a page into another page (or to the top level): move the file and its sub-pages, then
  // write the `order` that puts it where it was dropped (dropped onto a page, it goes last).
  const movePage = useCallback(
    async (path: string, dest: string, siblings: string[], gap: number | null) => {
      const from = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (from === dest) return;
      try {
        const next = await api.moveNote(path, dest);
        const [oldKey, newKey] = [path.replace(/\.md$/, ""), next.replace(/\.md$/, "")];
        const remap = (p: string) => (p === path ? next : p.startsWith(`${oldKey}/`) ? newKey + p.slice(oldKey.length) : p);
        setTabs((t) => ({ ...t, list: t.list.map((tab) => ({ ...tab, stack: tab.stack.map(remap) })) }));
        setRecents((r) => r.map(remap));
        setFavorites((f) => f.map(remap));
        setExpanded((prev) => new Set([...prev, ...(dest ? [dest, ...ancestorKeys(`${dest}.md`)] : [])]));
        if (peekPath) setPeekPath(remap(peekPath));
        const byPath = new Map((await refresh()).map((n) => [n.path, n]));
        // Its old position means nothing here: it lands at `gap`, or last when dropped onto a page.
        const list = [...siblings.map((s) => ({ path: s, order: byPath.get(s)?.order ?? null })), { path: next, order: null }];
        const writes: Record<string, number | null> = gap === null ? {} : planReorder(list, next, gap);
        if (!(next in writes) && byPath.get(next)?.order != null) writes[next] = null;
        await writeOrders(writes);
      } catch (e) {
        await message(String(e), { title: "Betelgeuse", kind: "error" });
      } finally {
        await refresh();
        setRefreshKey((k) => k + 1);
      }
    },
    [refresh, peekPath],
  );

  const renamed = useCallback(
    async (old: string, next: string) => {
      if (old === next) return;
      const [oldKey, newKey] = [old.replace(/\.md$/, ""), next.replace(/\.md$/, "")];
      const remap = (p: string) => (p === old ? next : p.startsWith(`${oldKey}/`) ? newKey + p.slice(oldKey.length) : p);
      const remapKey = (k: string) => (k === oldKey || k.startsWith(`${oldKey}/`) ? newKey + k.slice(oldKey.length) : k);
      setTabs((t) => ({ ...t, list: t.list.map((tab) => ({ ...tab, stack: tab.stack.map(remap) })) }));
      setRecents((r) => r.map(remap));
      setFavorites((f) => f.map(remap));
      setPeekPath((p) => p && remap(p));
      setExpanded((prev) => new Set([...prev].map(remapKey)));
      await refresh();
      setRefreshKey((k) => k + 1);
    },
    [refresh],
  );

  const ctx: VaultContextValue = useMemo(
    () => ({ notes, refreshKey, openPage, peek: setPeekPath, createPage, refresh, renamed, aiPolicy, setPageAi }),
    [notes, refreshKey, openPage, createPage, refresh, renamed, aiPolicy, setPageAi],
  );
  const tree = useMemo(() => buildTree(notes), [notes]);

  if (error) {
    return <div className="grid h-full place-items-center bg-surface p-8 text-sm text-muted">Could not open workspace: {error}</div>;
  }
  if (!vault) {
    return (
      <div className="grid h-full place-items-center bg-surface">
        <Logo className="size-10 animate-pulse" />
      </div>
    );
  }

  const pageProps = {
    onRenamed: async (old: string, next: string) => {
      const peeked = peekPath === old;
      await renamed(old, next);
      if (!peeked) openPage(next);
    },
    onDeleted: deletePage,
    onSaved: () => api.gitStatus().then(setStatus).catch(() => {}),
  };

  return (
    <VaultContext.Provider value={ctx}>
      <div className="flex h-full bg-surface text-ink">
        {/* Closed sidebar: hovering the window's left edge peeks it. */}
        {!sidebar && !sidebarPeek && <div onMouseEnter={() => setSidebarPeek(true)} className="fixed top-12 bottom-0 left-0 z-30 w-2" />}
        {
          <Sidebar
            open={sidebar}
            peeking={sidebarPeek}
            fullscreen={fullscreen}
            onDock={() => {
              setSidebar(true);
              setSidebarPeek(false);
            }}
            onPeekEnd={() => setSidebarPeek(false)}
            vault={vault}
            tree={tree}
            notes={notes}
            favorites={favorites}
            recents={recents}
            openPath={openPath}
            expanded={expanded}
            status={status}
            busy={busy}
            onToggle={toggle}
            onOpen={openPage}
            onCreate={(parent) => createPage(parent).then(openPage)}
            onCreateHere={() => createHere().then(openPage)}
            onDelete={deletePage}
            onDuplicate={async (path) => openPage(await api.duplicateNote(path))}
            onToggleFavorite={toggleFavorite}
            onReorder={reorderPage}
            onMove={movePage}
            onSearch={() => setPalette(true)}
            onOpenPluginView={(pluginId, viewId, e) => openPage(viewPath(pluginId, viewId), { newTab: wantsNewTab(e) })}
            onSwitchVault={async () => {
              const dir = await openDialog({ directory: true, title: "Open or create a workspace folder" });
              if (typeof dir === "string") await openVault(await api.openVault(dir));
            }}
            onCommit={() => run("Committing…", () => api.gitCommit())}
            onSync={() => run("Syncing…", () => api.gitSync())}
            onAgents={() => setAgents(true)}
            onSettings={() => setSettings("appearance")}
            onImport={() => setSettings("import")}
            onCollapse={() => setSidebar(false)}
          />
        }

        <div className="relative flex min-w-0 flex-1 flex-col">
          {openPath && (
            <TabBar
              tabs={tabs.list.map((tab) => ({ id: tab.id, path: current(tab)! }))}
              active={tabs.active}
              notes={notes}
              inset={!sidebar && !fullscreen}
              onSelect={selectTab}
              onClose={closeTab}
              onCloseOthers={(i) => keepTabs(i, (k) => k === i)}
              onCloseRight={(i) => keepTabs(i, (k) => k <= i)}
              onNew={() => openPath && openPage(openPath, { newTab: true })}
              onBack={activeTab && activeTab.index > 0 ? () => go(-1) : undefined}
              onForward={activeTab && activeTab.index < activeTab.stack.length - 1 ? () => go(1) : undefined}
              onShowSidebar={sidebar ? undefined : () => (setSidebar(true), setSidebarPeek(false))}
              onPeekSidebar={() => setSidebarPeek(true)}
            />
          )}
          <div className="relative flex min-h-0 flex-1">
          {openPath && parseViewPath(openPath) ? (
            <PluginView path={openPath} onOpenSettings={() => setSettings("plugins")} />
          ) : pagePath ? (
            <PageView
              key={vault.path}
              path={pagePath}
              historyOpen={history}
              favorite={favorites.includes(pagePath)}
              onToggleFavorite={() => toggleFavorite(pagePath)}
              onToggleHistory={() => setHistory((v) => !v)}
              {...pageProps}
            />
          ) : (
            <div data-tauri-drag-region className="grid flex-1 place-items-center">
              <button onClick={() => createPage(null).then(openPage)} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-hover">
                Create your first page
              </button>
            </div>
          )}

          {peekPath && (
            <div className="peek-panel absolute inset-y-0 right-0 z-30 flex w-[min(720px,62%)] border-l border-line bg-surface shadow-peek">
              {/* Not keyed by path: switching rows swaps the page in place, keeping the old one on
                  screen until the next has loaded. */}
              <PageView path={peekPath} mode="peek" onClose={() => setPeekPath(null)} {...pageProps} />
            </div>
          )}
          </div>
        </div>

        {history && pagePath && (
          <HistoryPanel
            path={pagePath}
            refreshKey={refreshKey}
            onClose={() => setHistory(false)}
            onRestore={async (content, commit) => {
              await api.writeNote(pagePath, content);
              await api.gitCommit(`Restore ${pagePath.split("/").pop()!.replace(/\.md$/, "")} to ${commit.short}`);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}

        {palette && (
          <CommandPalette
            notes={notes}
            onOpen={openPage}
            onCreate={(title) => createHere(title).then(openPage)}
            onClose={() => setPalette(false)}
          />
        )}
        {agents && <AgentsDialog onClose={() => setAgents(false)} />}
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        {settings && (
          <SettingsDialog
            initial={settings}
            vault={vault}
            status={status}
            pageCount={notes.length}
            aiPolicy={aiPolicy}
            onAiPolicy={async (policy) => {
              await api.setAiPolicy(policy);
              setAiPolicyState(policy);
            }}
            onClose={() => setSettings(false)}
            onChanged={refresh}
            onOpenAgents={() => {
              setSettings(false);
              setAgents(true);
            }}
            onSwitchVault={async () => {
              const dir = await openDialog({ directory: true, title: "Open or create a workspace folder" });
              if (typeof dir === "string") {
                setSettings(false);
                await openVault(await api.openVault(dir));
              }
            }}
          />
        )}
      </div>
    </VaultContext.Provider>
  );
}

/** The new page list, reusing the old entries (and the old list) where nothing changed. */
function reconcileNotes(prev: NoteMeta[], next: NoteMeta[]): NoteMeta[] {
  const old = new Map(prev.map((n) => [n.path, n]));
  let same = prev.length === next.length;
  const out = next.map((n, i) => {
    const o = old.get(n.path);
    const keep = o && JSON.stringify(o) === JSON.stringify(n) ? o : n;
    if (keep !== prev[i]) same = false;
    return keep;
  });
  return same ? prev : out;
}
