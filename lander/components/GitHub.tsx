"use client";

import { GitFork, Scale, Star, Tag } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { REPO } from "@/lib/site";
import { API, parseRelease, parseRepo, type Release, type Repo, type Snapshot } from "@/lib/github";

const CACHE_MS = 30 * 60 * 1000;

function cached<T>(key: string): T | undefined {
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  } catch {}
  return undefined;
}

function remember(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {}
}

// One request per page view, shared by every component that needs it.
let repoPromise: Promise<Repo | null> | null = null;
function loadRepo() {
  repoPromise ??= (async () => {
    const hit = cached<Repo>("bg-repo");
    if (hit) return hit;
    let repo: Repo | null = null;
    try {
      const r = await fetch(API);
      if (r.ok) repo = parseRepo(await r.json());
    } catch {}
    if (!repo) {
      // GitHub limits anonymous API calls; shields.io serves the same counts from its cache.
      try {
        const [stars, forks] = await Promise.all(
          ["stars", "forks"].map((k) => fetch(`https://img.shields.io/github/${k}/devian-labs/betelgeuse.json`).then((r) => r.json())),
        );
        const n = (v: { value: string }) => Number.parseInt(v.value, 10);
        if (Number.isFinite(n(stars)) && Number.isFinite(n(forks))) repo = { stars: n(stars), forks: n(forks) };
      } catch {}
    }
    if (repo) remember("bg-repo", repo);
    return repo;
  })();
  return repoPromise;
}

let releasePromise: Promise<Release | null | undefined> | null = null;
function loadRelease() {
  releasePromise ??= (async () => {
    const hit = cached<Release | null>("bg-release");
    if (hit !== undefined) return hit;
    try {
      const r = await fetch(`${API}/releases/latest`);
      const release = r.ok ? parseRelease(await r.json()) : r.status === 404 ? null : undefined;
      if (release !== undefined) remember("bg-release", release);
      return release;
    } catch {
      return undefined;
    }
  })();
  return releasePromise;
}

const SnapshotContext = createContext<Snapshot>({ repo: null, release: undefined, languages: [] });

/** Seeds every GitHub-aware component with the facts fetched at build time. */
export function GitHubProvider({ initial, children }: { initial: Snapshot; children: React.ReactNode }) {
  return <SnapshotContext.Provider value={initial}>{children}</SnapshotContext.Provider>;
}

export function useRepo() {
  const initial = useContext(SnapshotContext).repo;
  const [repo, setRepo] = useState(initial);
  useEffect(() => {
    loadRepo().then((r) => r && setRepo(r));
  }, []);
  return repo;
}

/** `loading` is true only while we know nothing at all about releases. */
export function useRelease() {
  const initial = useContext(SnapshotContext).release;
  const [release, setRelease] = useState(initial);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    loadRelease().then((r) => {
      if (r !== undefined) setRelease(r);
      setSettled(true);
    });
  }, []);
  return { loading: release === undefined && !settled, release: release ?? null };
}

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 00-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 015.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0012 .5z" />
    </svg>
  );
}

export function StarIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" />
    </svg>
  );
}

/** "Star on GitHub" with the star count. */
export function StarButton({ className = "button", label = "Star on GitHub" }: { className?: string; label?: string }) {
  const repo = useRepo();
  return (
    <a className={`${className} star-button`} href={REPO}>
      <GitHubIcon />
      <span>{label}</span>
      {repo && (
        <span className="star-count">
          <StarIcon size={13} />
          {compact(repo.stars)}
        </span>
      )}
    </a>
  );
}

// GitHub's linguist colours.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  Rust: "#dea584",
  CSS: "#663399",
  JavaScript: "#f1e05a",
  Shell: "#89e051",
  PowerShell: "#012456",
  HTML: "#e34c26",
  Other: "#8a8580",
};

const FALLBACK_DESCRIPTION = "A beautiful workspace on plain Markdown and git, open to AI agents over MCP.";
const FALLBACK_TOPICS = ["notes-app", "open-source", "productivity"];

/** The repository, laid out like a GitHub repo card: name, description, topics, stats and languages. */
export function RepoCard({ children }: { children?: React.ReactNode }) {
  const repo = useRepo();
  const { release } = useRelease();
  const { languages } = useContext(SnapshotContext);
  const plural = (n: number, word: string) => `${compact(n)} ${word}${n === 1 ? "" : "s"}`;
  return (
    <div className="repo-card">
      <div className="repo-head">
        <img src="/app-icon.png" alt="" width={44} height={44} />
        <div>
          <a href={REPO} className="repo-name">
            devian-labs / <strong>betelgeuse</strong>
          </a>
          <span className="repo-public">Public</span>
        </div>
      </div>
      <p className="repo-desc">{repo?.description || FALLBACK_DESCRIPTION}</p>
      <div className="repo-topics">
        {(repo?.topics?.length ? repo.topics : FALLBACK_TOPICS).map((t) => (
          <a key={t} href={`https://github.com/topics/${t}`}>
            {t}
          </a>
        ))}
      </div>
      <div className="repo-meta">
        {repo && (
          <>
            <a href={`${REPO}/stargazers`}>
              <Star size={15} /> {plural(repo.stars, "star")}
            </a>
            <a href={`${REPO}/forks`}>
              <GitFork size={15} /> {plural(repo.forks, "fork")}
            </a>
          </>
        )}
        <a href={`${REPO}/releases`}>
          <Tag size={15} /> {release ? release.version : "Preview"}
        </a>
        <a href={`${REPO}/blob/main/LICENSE`}>
          <Scale size={15} /> MIT
        </a>
      </div>
      {languages.length > 0 && (
        <div className="repo-langs">
          <div className="lang-bar" aria-hidden>
            {languages.map((l) => (
              <span key={l.name} style={{ width: `${l.share}%`, background: LANGUAGE_COLORS[l.name] ?? LANGUAGE_COLORS.Other }} />
            ))}
          </div>
          <ul>
            {languages.slice(0, 4).map((l) => (
              <li key={l.name}>
                <i style={{ background: LANGUAGE_COLORS[l.name] ?? LANGUAGE_COLORS.Other }} />
                {l.name} <span>{l.share.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
}

type Contributor = { login: string; avatar_url: string; html_url: string };

/** Contributor avatars from GitHub. Renders nothing until there are some. */
export function Contributors() {
  const [people, setPeople] = useState<Contributor[]>([]);
  useEffect(() => {
    const hit = cached<Contributor[]>("bg-contributors");
    if (hit) return setPeople(hit);
    fetch(`${API}/contributors?per_page=24`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d) && d.length) {
          setPeople(d);
          remember("bg-contributors", d);
        }
      })
      .catch(() => {});
  }, []);
  if (!people.length) return null;
  return (
    <div className="contributors">
      <div className="avatars">
        {people.map((p) => (
          <a key={p.login} href={p.html_url} title={p.login}>
            <img src={`${p.avatar_url}&s=80`} alt={p.login} width={40} height={40} loading="lazy" />
          </a>
        ))}
      </div>
      <span>Thanks to everyone who has contributed.</span>
    </div>
  );
}
