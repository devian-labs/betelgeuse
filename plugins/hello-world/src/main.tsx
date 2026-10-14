import { definePlugin, type PluginContext } from "@betelgeuse/plugin-api";
import { Button, EmptyState, SettingRow, TextInput } from "@betelgeuse/plugin-api/ui";
import { useEffect, useState } from "react";
import "./styles.css";

type Settings = { greeting?: string };

export const { activate, deactivate } = definePlugin({
  activate(ctx: PluginContext) {
    const settings = ctx.storage.workspace;

    // A tab view, opened from the sidebar item below.
    ctx.views.register("hello", {
      title: "Hello",
      icon: <span>👋</span>,
      component: () => <HelloView ctx={ctx} />,
    });
    ctx.sidebar.register({ id: "hello", title: "Hello", icon: <span>👋</span>, view: "hello" });

    // A section in Settings, saved with the workspace.
    ctx.settings.register({
      title: "Hello World",
      icon: <span>👋</span>,
      component: () => {
        const [greeting, setGreeting] = useState("");
        useEffect(() => void settings.get<Settings>().then((s) => setGreeting(s.greeting ?? "Hello")), []);
        return (
          <SettingRow label="Greeting" hint="Shown at the top of the Hello view.">
            <TextInput value={greeting} onChange={(e) => setGreeting(e.target.value)} onBlur={() => settings.set({ greeting })} />
          </SettingRow>
        );
      },
    });

    // A panel under the properties of every page: its word count.
    ctx.pagePanels.register({
      id: "word-count",
      component: ({ page }) => {
        const [words, setWords] = useState<number | null>(null);
        useEffect(() => {
          ctx.workspace?.readPage(page.path).then((p) => setWords(p.body.split(/\s+/).filter(Boolean).length));
        }, [page.path]);
        return words == null ? null : <div className="mt-3 text-xs text-faint">👋 {words.toLocaleString()} words</div>;
      },
    });

    // A command in ⌘K.
    ctx.commands.register({ id: "greet", title: "Say hello", run: async () => ctx.ui.toast(`${(await settings.get<Settings>()).greeting ?? "Hello"} from a plugin!`) });

    // Results in ⌘K: pages whose title contains the query, shouted.
    ctx.search.register({
      id: "loud-pages",
      title: "Hello World",
      search: async (query) => {
        const pages = (await ctx.workspace?.listPages()) ?? [];
        return pages
          .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 3)
          .map((p) => ({ id: p.path, title: `${p.title.toUpperCase()}!`, detail: "Opens the page", run: () => ctx.workspace?.openPage(p.path) }));
      },
    });

    ctx.log("activated");
  },
  deactivate() {
    // Everything registered through ctx is cleaned up automatically.
  },
});

function HelloView({ ctx }: { ctx: PluginContext }) {
  const [greeting, setGreeting] = useState("Hello");
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    ctx.storage.workspace.get<Settings>().then((s) => setGreeting(s.greeting ?? "Hello"));
    const load = () => ctx.workspace?.listPages().then((p) => setCount(p.length));
    load();
    const sub = ctx.workspace?.onChange(load);
    return () => sub?.dispose();
  }, [ctx]);
  return (
    <EmptyState icon={<span className="text-4xl">👋</span>} title={`${greeting}!`}>
      <p>This view comes from the Hello World plugin. Your workspace has {count ?? "…"} pages.</p>
      <div className="mt-4">
        <Button variant="primary" onClick={() => ctx.commands.run("greet")}>
          Say hello
        </Button>
      </div>
    </EmptyState>
  );
}
