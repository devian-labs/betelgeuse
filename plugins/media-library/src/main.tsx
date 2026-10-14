/**
 * Media Library: browse and search media and project files where they are, and link project
 * folders to pages (the rows of a pipeline database).
 *
 * Adds a Library view (and its sidebar item), a settings section, an Assets panel on productions
 * (rows of the pipeline database), file results in ⌘K and a few commands. The files themselves are
 * indexed by Betelgeuse's media library service (`ctx.library`), which this plugin turns on.
 */
import { definePlugin, type Asset, type PluginContext } from "@betelgeuse/plugin-api";
import { Library, RefreshCw } from "lucide-react";
import { AssetsPanel } from "./AssetsPanel";
import { setContext } from "./host";
import { LibraryView, Thumb } from "./LibraryView";
import { currentPipeline, loadPipeline } from "./pipeline";
import { formatDuration, resetStore, startStore, useStudio } from "./store";
import { LibrarySettings } from "./LibrarySettings";
import "./styles.css";

/** The sidebar's Library icon, spinning while the library scans. */
function LibraryIcon() {
  const { progress } = useStudio();
  return progress.phase === "idle" ? <Library size={16} /> : <RefreshCw size={14} className="animate-spin" />;
}

export const { activate, deactivate } = definePlugin({
  async activate(ctx: PluginContext) {
    setContext(ctx);
    startStore();
    await loadPipeline();
    // Pipeline settings can change from another machine (git) or by hand.
    ctx.workspace!.onChange(() => void loadPipeline());

    ctx.views.register("library", {
      title: "Library",
      icon: <Library size={14} />,
      component: () => <LibraryView onOpenSettings={() => ctx.settings.open()} />,
    });
    ctx.sidebar.register({ id: "library", title: "Library", icon: <LibraryIcon />, view: "library" });

    ctx.settings.register({ title: "Media Library", icon: <Library size={16} />, component: LibrarySettings });

    // Rows of the pipeline database are productions: show their project folder's files.
    ctx.pagePanels.register({
      id: "assets",
      when: (page) => !!page.database && page.database === currentPipeline().database,
      component: AssetsPanel,
    });

    ctx.search.register({
      id: "files",
      title: "Files",
      search: async (query) => {
        const { hits } = await ctx.library!.search({ text: query, limit: 6 });
        return hits.map((a: Asset) => ({
          id: a.id,
          title: a.name,
          detail: [a.id.slice(0, a.id.lastIndexOf("/")), formatDuration(a.duration)].filter(Boolean).join(" · "),
          icon: (
            <span className="block h-6 w-10 overflow-hidden rounded bg-side">
              <Thumb asset={a} />
            </span>
          ),
          run: () => void ctx.library!.open(a.id),
        }));
      },
    });

    ctx.commands.register({ id: "open-library", title: "Open Library", run: () => ctx.views.open("library") });
    ctx.commands.register({ id: "rescan", title: "Rescan library folders", run: () => ctx.library!.rescan() });
  },
  deactivate() {
    resetStore();
    setContext(null);
  },
});
