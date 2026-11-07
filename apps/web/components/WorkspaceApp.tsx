"use client";

import { useEffect, useState, type ComponentType } from "react";
// Applies the saved (or system) theme before the first paint, as in the other apps.
import "@betelgeuse/ui/lib/settings";
import { installPlatform } from "@betelgeuse/ui/platform";
import { setPlatform } from "@betelgeuse/ui/plugins/runtime";
import { Logo } from "@betelgeuse/ui/components/Logo";
import { makeCommands } from "@/lib/commands";
import { GitHub, GitHubError, SignedOut } from "@/lib/github";
import { PluginStore } from "@/lib/plugins";
import { accessToken, githubApi, remember } from "@/lib/session";
import { signOut } from "@/lib/sign-out";
import { IdbKV } from "@/lib/store";
import { eventBus, webPlatform } from "@/lib/web-platform";
import { Workspace } from "@/lib/workspace";
import { Card } from "./Card";

type State =
  | { kind: "opening"; done: number; total: number }
  | { kind: "ready"; App: ComponentType }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string };

const lockFor = (name: string) =>
  navigator.locks ? <T,>(run: () => Promise<T>) => navigator.locks.request(name, run) as Promise<T> : undefined;

/** Opens a repository as the workspace, then hands over to the same interface the desktop app has. */
export default function WorkspaceApp({ owner, repo }: { owner: string; repo: string }) {
  const [state, setState] = useState<State>({ kind: "opening", done: 0, total: 0 });
  const [authLost, setAuthLost] = useState(false);

  useEffect(() => {
    let stop = false;
    const name = `${owner}/${repo}`;
    const bus = eventBus();
    const github = new GitHub(accessToken, githubApi());
    const store = new IdbKV(`${owner}/${repo}`.toLowerCase());
    const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(`betelgeuse:${name}`.toLowerCase());
    const ws = new Workspace({ owner, repo, github, store, emit: bus.emit, channel, lock: lockFor(`betelgeuse:${name}`) });
    const unlisten = bus.listen<string>("auth-lost", () => setAuthLost(true));

    // A file dropped where nothing handles it would navigate away from the app.
    const guard = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);

    (async () => {
      try {
        await ws.open((done, total) => !stop && setState({ kind: "opening", done, total }));
        if (stop) return;
        const invoke = makeCommands(ws, new PluginStore(), store);
        const user = await github.user().catch(() => null);
        installPlatform(
          webPlatform({
            invoke,
            listen: bus.listen,
            account: { name: user?.login ?? "GitHub", signOut: () => confirmSignOut(ws) },
            switchWorkspace: () => window.location.assign("/?choose"),
          }),
        );
        setPlatform("web");
        remember(name);
        const { default: App } = await import("@betelgeuse/ui/App");
        if (!stop) setState({ kind: "ready", App });
      } catch (e) {
        if (stop) return;
        if (e instanceof SignedOut) setState({ kind: "signed-out" });
        else if (e instanceof GitHubError && (e.status === 404 || e.status === 403)) {
          remember(null);
          setState({ kind: "failed", message: `Betelgeuse can't reach ${name}. Check the repository exists and that you gave the app access to it.` });
        } else setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      stop = true;
      ws.dispose();
      channel?.close();
      void unlisten.then((f) => f());
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, [owner, repo]);

  if (state.kind === "ready") {
    const { App } = state;
    return (
      <>
        <App />
        {authLost && (
          <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-[var(--c-orange-bg)] px-4 py-2 text-sm text-[var(--c-orange-text)]">
            Your GitHub session ended. Your edits are safe in this browser.
            <a href="/api/auth/login" className="font-medium underline">
              Sign in again
            </a>
          </div>
        )}
      </>
    );
  }
  if (state.kind === "signed-out") {
    return (
      <Card title="Sign in to keep working" hint={`Your GitHub session ended. Sign in to open ${owner}/${repo}.`}>
        <a href="/api/auth/login" className="flex h-9 items-center justify-center rounded-md bg-[var(--blue)] text-sm font-medium text-white hover:brightness-110">
          Sign in with GitHub
        </a>
      </Card>
    );
  }
  if (state.kind === "failed") {
    return (
      <Card title="Couldn't open this workspace" hint={state.message}>
        <a href="/?choose" className="flex h-9 items-center justify-center rounded-md border border-line text-sm font-medium text-ink hover:bg-hover">
          Choose a repository
        </a>
      </Card>
    );
  }
  return (
    <div className="grid h-full place-items-center bg-surface text-ink">
      <div className="flex flex-col items-center gap-3">
        <Logo className="size-10 animate-pulse" />
        <div className="text-sm text-muted">
          {state.total > 0 ? `Reading ${state.done.toLocaleString()} of ${state.total.toLocaleString()} pages from GitHub…` : `Opening ${owner}/${repo}…`}
        </div>
      </div>
    </div>
  );
}

async function confirmSignOut(ws: Workspace) {
  await ws.flush();
  const unsynced = ws.changes().length;
  if (unsynced) {
    try {
      await ws.sync();
    } catch {
      if (!window.confirm(`${unsynced} change${unsynced > 1 ? "s" : ""} couldn't be sent to GitHub, and signing out removes them from this browser. Sign out anyway?`)) return;
    }
  }
  await signOut();
}
