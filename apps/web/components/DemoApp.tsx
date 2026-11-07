"use client";

import { useEffect, useState, type ComponentType } from "react";
// Applies the saved (or system) theme before the first paint, as in the other apps.
import "@betelgeuse/ui/lib/settings";
import { Logo } from "@betelgeuse/ui/components/Logo";
import { installPlatform } from "@betelgeuse/ui/platform";
import { setPlatform } from "@betelgeuse/ui/plugins/runtime";
import { makeCommands } from "@/lib/commands";
import { DemoGitHub } from "@/lib/demo/github";
import { PluginStore } from "@/lib/plugins";
import { starterPages } from "@/lib/starter";
import { MemoryKV } from "@/lib/store";
import { eventBus, webPlatform } from "@/lib/web-platform";
import { Workspace } from "@/lib/workspace";
import { Card } from "./Card";

const DAY = 24 * 3600 * 1000;
const DOWNLOAD = "https://betelgeuse.pro/#download";

/** The whole app with no account: sample pages in memory, gone when the tab closes or reloads. */
export default function DemoApp() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = false;
    let ws: Workspace | undefined;
    (async () => {
      const files = await starterPages();
      const bus = eventBus();
      const store = new MemoryKV();
      ws = new Workspace({ owner: "betelgeuse", repo: "Demo", github: new DemoGitHub(files, 2 * DAY), store, emit: bus.emit });
      await ws.open();
      if (stop) return;
      const commands = makeCommands(ws, new PluginStore(store), store);
      const invoke = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
        const result = await commands<T>(command, args);
        // There's no repository to point at.
        return (command === "git_settings" ? { ...result, remote_url: "This demo: nothing leaves this tab" } : result) as T;
      };
      installPlatform({ ...webPlatform({ invoke, listen: bus.listen, account: { name: "", signOut: () => {} }, switchWorkspace: () => window.location.assign("/") }), account: undefined });
      setPlatform("web");
      const { default: Loaded } = await import("@betelgeuse/ui/App");
      if (!stop) setApp(() => Loaded);
    })().catch((e) => {
      console.error("demo", e);
      if (!stop) setFailed(true);
    });
    return () => {
      stop = true;
      ws?.dispose();
    };
  }, []);

  if (failed) {
    return (
      <Card title="The demo didn't load" hint="Please reload the page and try again.">
        <button onClick={() => window.location.reload()} className="h-9 rounded-md border border-line text-sm font-medium hover:bg-hover">
          Reload
        </button>
      </Card>
    );
  }
  if (!App) {
    return (
      <div className="grid h-full place-items-center bg-surface">
        <Logo className="size-10 animate-pulse" />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-[var(--accent-soft)] px-4 py-1.5 text-[13px] text-ink">
        <span>
          <strong className="font-semibold">This is a demo.</strong> Try anything: your changes stay in this tab and are gone when you reload.
        </span>
        <span className="flex items-center gap-3">
          <a href="/api/auth/login" className="font-medium text-[var(--accent)] underline underline-offset-2">
            Sign in with GitHub
          </a>
          <a href={DOWNLOAD} className="font-medium text-[var(--accent)] underline underline-offset-2">
            Download the app
          </a>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <App />
      </div>
    </div>
  );
}
