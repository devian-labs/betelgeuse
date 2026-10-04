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
import { Sidebar } from "./components/Sidebar";
import { api, type AiPolicy, type NoteMeta, type RepoStatus, type VaultInfo } from "./lib/api";
import { aiAccess } from "./lib/ai";
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

export default function App() {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [openPath, setOpenPath] = useState<string | null>(null);
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
      setVault(info);
      setFavorites(readList(`favorites:${info.path}`));
      api.getAiPolicy().then(setAiPolicyState).catch(() => {});
      const n = await refresh();
      const last = store.get(`open:${info.path}`);
      const first = n.find((x) => x.path === last)?.path ?? n.find((x) => x.title === "Welcome")?.path ?? n[0]?.path ?? null;
      setOpenPath(first);
      setNav({ stack: first ? [first] : [], index: first ? 0 : -1 });
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
  useEffect(() => store.set("expanded", JSON.stringify([...expanded])), [expanded]);
  useEffect(() => store.set("sidebar", sidebar ? "shown" : "hidden"), [sidebar]);
  useEffect(() => {
    if (vault) store.set(`favorites:${vault.path}`, JSON.stringify(favorites));
  }, [vault, favorites]);

  // Browser-style back/forward history, like Notion's arrows (⌘[ and ⌘]).
  const [nav, setNav] = useState<{ stack: string[]; index: number }>({ stack: [], index: -1 });

  const show = useCallback((path: string) => {
    setOpenPath(path);
    setPeekPath(null);
    setExpanded((prev) => new Set([...prev, ...ancestorKeys(path)]));
  }, []);

  const openPage = useCallback(
    (path: string) => {
      show(path);
      setNav((n) => (n.stack[n.index] === path ? n : { stack: [...n.stack.slice(0, n.index + 1), path], index: n.index + 1 }));
    },
    [show],
  );

  const go = useCallback(
    (delta: number) =>
      setNav((n) => {
        const index = n.index + delta;
        if (index < 0 || index >= n.stack.length) return n;
        show(n.stack[index]);
        return { ...n, index };
      }),
    [show],
  );

  const createPage = useCallback(
    async (parent: string | null, title = "Untitled") => {
      const path = await api.createNote(parent, title);
      await refresh();
      if (parent) setExpanded((prev) => new Set([...prev, parent.replace(/\.md$/, "")]));
      return path;
    },
    [refresh],
  );

  // Deleting moves to the Trash right away, with an Undo toast, like Notion.
  const deletePage = useCallback(
    async (path: string) => {
      const title = path.split("/").pop()!.replace(/\.md$/, "");
      const id = await api.deleteNote(path);
      const n = await refresh();
      setFavorites((f) => f.filter((x) => x !== path && !x.startsWith(path.replace(/\.md$/, "/"))));
      if (peekPath === path) setPeekPath(null);
      if (openPath && !n.some((x) => x.path === openPath)) setOpenPath(n[0]?.path ?? null);
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
    [refresh, openPath, peekPath, openPage],
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
      setNav((n) => ({ ...n, stack: n.stack.map((x) => (x === old ? next : x)) }));
      if (peekPath === old) setPeekPath(next);
      else openPage(next);
    },
    onDeleted: deletePage,
    onSaved: () => api.gitStatus().then(setStatus).catch(() => {}),
  };

  return (
    <VaultContext.Provider value={ctx}>
      <div className="flex h-full bg-surface text-ink">
        {/* Closed sidebar: hovering the window's left edge peeks it, like Notion. */}
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

        <div className="relative flex min-w-0 flex-1">
          {openPath ? (
            <PageView
              key={vault.path}
              path={openPath}
              historyOpen={history}
              inset={!sidebar && !fullscreen}
              onShowSidebar={sidebar ? undefined : () => (setSidebar(true), setSidebarPeek(false))}
              onPeekSidebar={() => setSidebarPeek(true)}
              onBack={nav.index > 0 ? () => go(-1) : undefined}
              onForward={nav.index < nav.stack.length - 1 ? () => go(1) : undefined}
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
