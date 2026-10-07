import { listen } from "@tauri-apps/api/event";
import { message, open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentsDialog } from "./components/AgentsDialog";
import { SettingsDialog, type Section } from "./components/SettingsDialog";
import { CommandPalette } from "./components/CommandPalette";
import { HistoryPanel } from "./components/HistoryPanel";
import { Logo } from "./components/Logo";
import { Toast, type ToastData } from "./components/Toast";
import { PageView } from "./components/PageView";
import { TabBar } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { api, type AiPolicy, type NoteMeta, type RepoStatus, type VaultInfo } from "./lib/api";
import { aiAccess } from "./lib/ai";
import type { OpenOptions } from "./lib/nav";
import { joinNote, patchFrontmatter, splitNote } from "./lib/frontmatter";
import { planReorder } from "./lib/order";
import { ancestorKeys, buildTree } from "./lib/tree";
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
  const [recents, setRecents] = useState<string[]>([]);
  const [peekPath, setPeekPath] = useState<string | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readList("expanded")));
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
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const refresh = useCallback(async () => {
    const [n, s] = await Promise.all([api.listNotes(), api.gitStatus().catch(() => null)]);
    setNotes(n);
    setStatus(s);
    return n;
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
      const saved = readList(`tabs:${info.path}`).filter(exists);
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
      listen("vault-changed", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          refresh();
          setRefreshKey((k) => k + 1);
        }, 250);
      }),
      listen("git-committed", () => refresh()),
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
    if (openPath) setRecents((r) => [openPath, ...r.filter((x) => x !== openPath)].slice(0, RECENTS));
  }, [openPath]);
  useEffect(() => store.set("expanded", JSON.stringify([...expanded])), [expanded]);
  useEffect(() => store.set("sidebar", sidebar ? "shown" : "hidden"), [sidebar]);
  useEffect(() => {
    if (vault) store.set(`favorites:${vault.path}`, JSON.stringify(favorites));
  }, [vault, favorites]);

  const reveal = useCallback((path: string) => {
    setPeekPath(null);
    setExpanded((prev) => new Set([...prev, ...ancestorKeys(path)]));
  }, []);

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

  const createPage = useCallback(
    async (parent: string | null, title = "Untitled") => {
      const path = await api.createNote(parent, title);
      await refresh();
      if (parent) setExpanded((prev) => new Set([...prev, parent.replace(/\.md$/, "")]));
      return path;
    },
    [refresh],
  );

  // Deleting moves to the Trash right away, with an Undo toast.
  const deletePage = useCallback(
    async (path: string) => {
      const title = path.split("/").pop()!.replace(/\.md$/, "");
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && peekPath && !document.querySelector("[data-popover]")) setPeekPath(null);
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") (e.preventDefault(), setPalette((v) => !v));
      if (key === "n" && !e.altKey) (e.preventDefault(), createPage(null).then(openPage));
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
        for (const [page, order] of Object.entries(writes)) {
          const { frontmatter, body } = splitNote(await api.readNote(page));
          await api.writeNote(page, joinNote(patchFrontmatter(frontmatter, { order }), body));
        }
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
        for (const [page, order] of Object.entries(writes)) {
          const { frontmatter, body } = splitNote(await api.readNote(page));
          await api.writeNote(page, joinNote(patchFrontmatter(frontmatter, { order }), body));
        }
      } catch (e) {
        await message(String(e), { title: "Betelgeuse", kind: "error" });
      } finally {
        await refresh();
        setRefreshKey((k) => k + 1);
      }
    },
    [refresh, peekPath],
  );

  const ctx: VaultContextValue = useMemo(
    () => ({ notes, refreshKey, openPage, peek: setPeekPath, createPage, refresh, aiPolicy, setPageAi }),
    [notes, refreshKey, openPage, createPage, refresh, aiPolicy, setPageAi],
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
      await refresh();
      setFavorites((f) => f.map((x) => (x === old ? next : x)));
      setTabs((t) => ({ ...t, list: t.list.map((tab) => ({ ...tab, stack: tab.stack.map((x) => (x === old ? next : x)) })) }));
      setRecents((r) => r.map((x) => (x === old ? next : x)));
      if (peekPath === old) setPeekPath(next);
      else openPage(next);
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
            onDelete={deletePage}
            onDuplicate={async (path) => openPage(await api.duplicateNote(path))}
            onToggleFavorite={toggleFavorite}
            onReorder={reorderPage}
            onMove={movePage}
            onSearch={() => setPalette(true)}
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
              onNew={() => openPath && openPage(openPath, { newTab: true })}
              onBack={activeTab && activeTab.index > 0 ? () => go(-1) : undefined}
              onForward={activeTab && activeTab.index < activeTab.stack.length - 1 ? () => go(1) : undefined}
              onShowSidebar={sidebar ? undefined : () => (setSidebar(true), setSidebarPeek(false))}
              onPeekSidebar={() => setSidebarPeek(true)}
            />
          )}
          <div className="relative flex min-h-0 flex-1">
          {openPath ? (
            <PageView
              key={vault.path}
              path={openPath}
              historyOpen={history}
              favorite={favorites.includes(openPath)}
              onToggleFavorite={() => toggleFavorite(openPath)}
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
              <PageView key={peekPath} path={peekPath} mode="peek" onClose={() => setPeekPath(null)} {...pageProps} />
            </div>
          )}
          </div>
        </div>

        {history && openPath && (
          <HistoryPanel
            path={openPath}
            refreshKey={refreshKey}
            onClose={() => setHistory(false)}
            onRestore={async (content, commit) => {
              await api.writeNote(openPath, content);
              await api.gitCommit(`Restore ${openPath.split("/").pop()!.replace(/\.md$/, "")} to ${commit.short}`);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}

        {palette && (
          <CommandPalette
            notes={notes}
            onOpen={openPage}
            onCreate={(title) => createPage(null, title).then(openPage)}
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
