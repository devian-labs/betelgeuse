"use client";

import { useEffect, useState } from "react";
import { REPO } from "@/lib/site";

const API = "https://api.github.com/repos/devian-labs/betelgeuse";

type Repo = { stars: number; forks: number };
type Contributor = { login: string; avatar_url: string; html_url: string };

// One request per page view, shared by every component that needs it.
let repoPromise: Promise<Repo | null> | null = null;
function loadRepo() {
  repoPromise ??= fetch(API)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d ? { stars: d.stargazers_count as number, forks: d.forks_count as number } : null))
    .catch(() => null);
  return repoPromise;
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

/** "Star on GitHub" with the live star count once it loads. */
export function StarButton({ className = "button", label = "Star on GitHub" }: { className?: string; label?: string }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  useEffect(() => {
    loadRepo().then(setRepo);
  }, []);
  return (
    <a className={`${className} star-button`} href={REPO}>
      <GitHubIcon />
      <span>{label}</span>
      <span className="star-count">
        <StarIcon size={13} />
        {repo ? compact(repo.stars) : "Star"}
      </span>
    </a>
  );
}

/** Contributor avatars from GitHub. Renders nothing until there are some. */
export function Contributors() {
  const [people, setPeople] = useState<Contributor[]>([]);
  useEffect(() => {
    fetch(`${API}/contributors?per_page=24`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setPeople(d))
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
