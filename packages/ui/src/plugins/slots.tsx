/**
 * Where plugins appear in the app: their tab views, page panels and sidebar items, each wrapped in
 * a boundary so a crashing plugin shows a message instead of taking the window down.
 */
import { Component, type ReactNode } from "react";
import { Puzzle, TriangleAlert } from "lucide-react";
import type { PageInfo } from "@betelgeuse/plugin-api";
import { parseViewPath, reportCrash, useContributions, usePlugins } from "./runtime";

class Boundary extends Component<{ pluginId: string; children: ReactNode; compact?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportCrash(this.props.pluginId, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`flex items-start gap-2 rounded-md border border-line text-xs text-muted ${this.props.compact ? "my-2 p-2" : "m-6 p-3"}`}>
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[var(--c-orange-text)]" />
        <span className="min-w-0 flex-1">
          The <b>{this.props.pluginId}</b> plugin ran into a problem: {this.state.error.message}
        </span>
        <button onClick={() => this.setState({ error: null })} className="shrink-0 underline hover:text-ink">
          Try again
        </button>
      </div>
    );
  }
}

/** A plugin's tab view (`@plugin/<id>/<view>`). */
export function PluginView({ path, onOpenSettings }: { path: string; onOpenSettings: () => void }) {
  const { views } = useContributions();
  const plugins = usePlugins();
  const ref = parseViewPath(path);
  const view = ref && views.find((v) => v.pluginId === ref.pluginId && v.id === ref.viewId);
  if (!ref || !view) {
    const p = ref && plugins.find((x) => x.id === ref.pluginId);
    return (
      <div data-tauri-drag-region className="grid flex-1 place-items-center px-8 text-center">
        <div className="flex max-w-sm flex-col items-center">
          <Puzzle size={28} className="mb-3 text-faint" />
          <div className="mb-1.5 text-base font-medium">{p?.status === "loading" ? "Loading…" : "This view comes from a plugin"}</div>
          <div className="text-sm text-muted">
            {!p
              ? `The ${ref?.pluginId ?? "?"} plugin isn't installed.`
              : !p.enabled
                ? `Turn on ${p.manifest.name} in Settings → Plugins to use it.`
                : p.problem ?? `${p.manifest.name} is starting.`}
          </div>
          {p?.status !== "loading" && (
            <button onClick={onOpenSettings} className="mt-4 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover">
              Open Settings → Plugins
            </button>
          )}
        </div>
      </div>
    );
  }
  const V = view.component;
  // A row, so the view's root is stretched to exactly the space under the tab bar (whatever its own
  // layout): its scrolling areas get a fixed height to scroll within.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <Boundary pluginId={view.pluginId}>
        <V viewId={view.id} />
      </Boundary>
    </div>
  );
}

/** Plugin panels on a page, under its properties. */
export function PluginPagePanels({ page }: { page: Omit<PageInfo, "setProperties"> & { setProperties: (patch: Record<string, unknown>) => void } }) {
  const { pagePanels } = useContributions();
  const shown = pagePanels.filter((panel) => {
    try {
      return !panel.when || panel.when(withWrite(page, panel.permissions));
    } catch (e) {
      reportCrash(panel.pluginId, e);
      return false;
    }
  });
  if (!shown.length) return null;
  return (
    <>
      {shown.map((panel) => {
        const P = panel.component;
        return (
          <Boundary key={`${panel.pluginId}:${panel.id}`} pluginId={panel.pluginId} compact>
            <P page={withWrite(page, panel.permissions)} />
          </Boundary>
        );
      })}
    </>
  );
}

const withWrite = (page: Parameters<typeof PluginPagePanels>[0]["page"], permissions: string[]): PageInfo => ({
  ...page,
  setProperties: async (patch) => {
    if (!permissions.includes("workspace:write")) throw new Error('Changing properties needs the "workspace:write" permission.');
    page.setProperties(patch);
  },
});

/** Plugin items in the sidebar's top group. */
export function PluginSidebarItems({ activePath, onOpenView }: { activePath?: string; onOpenView: (pluginId: string, viewId: string, e: React.MouseEvent) => void }) {
  const { sidebar } = useContributions();
  if (!sidebar.length) return null;
  const active = activePath ? parseViewPath(activePath) : null;
  return (
    <>
      {sidebar.map((item) => {
        const on = !!active && active.pluginId === item.pluginId && active.viewId === item.view;
        return (
          <button
            key={`${item.pluginId}:${item.id}`}
            onClick={(e) => (item.view ? onOpenView(item.pluginId, item.view, e) : item.onClick?.())}
            className={`flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-sm ${on ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover"}`}
          >
            <span className={`grid w-4 shrink-0 place-items-center ${on ? "text-[var(--accent)]" : "text-faint"}`}>{item.icon ?? <Puzzle size={15} />}</span>
            <span className="flex-1 truncate text-left">{item.title}</span>
          </button>
        );
      })}
    </>
  );
}

/** A plugin's settings section, inside Settings. */
export function PluginSettingsSection({ sectionKey }: { sectionKey: string }) {
  const { settings } = useContributions();
  const s = settings.find((x) => x.key === sectionKey);
  if (!s) return null;
  const C = s.component;
  return (
    <>
      <div className="mb-5 border-b border-line pb-3">
        <h2 className="text-lg font-semibold text-ink">{s.title}</h2>
      </div>
      <Boundary pluginId={s.pluginId}>
        <C />
      </Boundary>
    </>
  );
}
