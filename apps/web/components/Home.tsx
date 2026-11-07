"use client";

import { ExternalLink, GitFork, Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
// Applies the saved (or system) theme before the first paint, as in the other apps.
import "@betelgeuse/ui/lib/settings";
import { GitHub, SignedOut, type Repository, type User } from "@/lib/github";
import { accessToken, githubApi, installUrl, newRepoUrl, remembered } from "@/lib/session";
import { signOut } from "@/lib/sign-out";
import { Card } from "./Card";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "not-configured" } | { kind: "signed-in"; user: User | null; repos: Repository[] } | { kind: "failed"; message: string };

const ERRORS: Record<string, string> = {
  "sign-in-failed": "GitHub sign-in didn't finish. Please try again.",
  "not-configured": "This server isn't set up for GitHub sign-in yet.",
};

const openRepo = (fullName: string) => window.location.assign(`/w/${fullName.split("/").map(encodeURIComponent).join("/")}`);

/** Signing in, then choosing which repository to work in. */
export default function Home() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  useEffect(() => {
    (async () => {
      const github = new GitHub(accessToken, githubApi());
      try {
        await accessToken();
      } catch (e) {
        if (e instanceof SignedOut) return setState({ kind: "signed-out" });
        const probe = await fetch("/api/auth/token", { method: "POST" }).catch(() => null);
        return setState(probe?.status === 503 ? { kind: "not-configured" } : { kind: "failed", message: e instanceof Error ? e.message : String(e) });
      }
      const last = remembered();
      if (last && !params.has("choose")) return openRepo(last);
      const [user, repos] = await Promise.all([github.user().catch(() => null), github.repositories()]);
      setState({ kind: "signed-in", user, repos });
    })().catch((e) => setState(e instanceof SignedOut ? { kind: "signed-out" } : { kind: "failed", message: e instanceof Error ? e.message : String(e) }));
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") return <div className="h-full bg-surface" />;

  if (state.kind === "not-configured") {
    return (
      <Card title="Almost ready" hint="This Betelgeuse server needs a GitHub App before anyone can sign in. The steps are in apps/web/README.md." />
    );
  }

  if (state.kind === "signed-out") {
    return (
      <Card
        title="Betelgeuse"
        hint="Your notes, docs and databases, in the browser. Every page stays a Markdown file in your own GitHub repository: your browser talks to GitHub directly, and nothing is stored on our servers."
      >
        {error && <p className="rounded-md bg-[var(--c-red-bg)] px-3 py-2 text-sm text-[var(--c-red-text)]">{ERRORS[error] ?? "Something went wrong signing in."}</p>}
        <a href="/api/auth/login" className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--blue)] text-sm font-medium text-white hover:brightness-110">
          <GitFork size={16} /> Sign in with GitHub
        </a>
        <p className="text-xs leading-relaxed text-faint">
          You choose which repositories Betelgeuse can open, and you can take that back any time in your GitHub settings.{" "}
          <a href="https://betelgeuse.pro" className="underline underline-offset-2 hover:text-ink">
            What is Betelgeuse?
          </a>
        </p>
      </Card>
    );
  }

  if (state.kind === "failed") {
    return (
      <Card title="Couldn't reach GitHub" hint={state.message}>
        <button onClick={() => window.location.reload()} className="h-9 rounded-md border border-line text-sm font-medium hover:bg-hover">
          Try again
        </button>
      </Card>
    );
  }

  const { user, repos } = state;
  return (
    <Card wide title="Choose a workspace" hint={repos.length ? "Each repository is a workspace. Pages you create here are committed to it." : "Betelgeuse can't see any repositories yet. Give it access to the one your notes live in, or make a new private one first."}>
      {repos.length > 0 && (
        <ul className="max-h-[320px] divide-y divide-[var(--line)] overflow-y-auto rounded-lg border border-line">
          {repos.map((r) => (
            <li key={r.full_name}>
              <button onClick={() => openRepo(r.full_name)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-hover">
                {r.private ? <Lock size={14} className="shrink-0 text-faint" /> : <GitFork size={14} className="shrink-0 text-faint" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.full_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <a href={installUrl()} className="flex h-9 items-center justify-center gap-2 rounded-md border border-line text-sm font-medium hover:bg-hover">
        <Plus size={15} /> Give access to {repos.length ? "another" : "a"} repository
      </a>
      <a href={newRepoUrl()} target="_blank" rel="noreferrer" className="flex h-9 items-center justify-center gap-2 rounded-md text-sm text-muted hover:bg-hover">
        <ExternalLink size={14} /> Make a new private repository on GitHub
      </a>
      <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
        <span>{user ? `Signed in as ${user.login}` : "Signed in"}</span>
        <button onClick={() => void signOut()} className="underline underline-offset-2 hover:text-ink">
          Sign out
        </button>
      </div>
    </Card>
  );
}
