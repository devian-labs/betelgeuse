// Repository facts, fetched once at build time so the static page never ships empty.
// The browser refreshes them later (components/GitHub.tsx).

export type Repo = { stars: number; forks: number; description?: string | null; topics?: string[] };
export type Language = { name: string; share: number };
export type Asset = { name: string; url: string; size: number };
export type Release = { version: string; date: string; url: string; assets: Asset[] };
/** `release` is null when there is no release yet, undefined when GitHub couldn't be reached. */
export type Snapshot = { repo: Repo | null; release: Release | null | undefined; languages: Language[] };

export const API = "https://api.github.com/repos/devian-labs/betelgeuse";

export function parseRepo(d: { stargazers_count: number; forks_count: number; description: string | null; topics?: string[] }): Repo {
  return { stars: d.stargazers_count, forks: d.forks_count, description: d.description, topics: d.topics };
}

/** Languages by share of bytes, largest first; anything under 1% is folded into "Other". */
export function parseLanguages(d: Record<string, number>): Language[] {
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  if (!total) return [];
  const all = Object.entries(d)
    .map(([name, bytes]) => ({ name, share: (bytes / total) * 100 }))
    .sort((a, b) => b.share - a.share);
  const main = all.filter((l) => l.share >= 1);
  const other = all.filter((l) => l.share < 1).reduce((a, l) => a + l.share, 0);
  return other > 0 ? [...main, { name: "Other", share: other }] : main;
}

export function parseRelease(d: {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}): Release {
  return {
    version: d.tag_name,
    date: d.published_at,
    url: d.html_url,
    assets: d.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
  };
}

export async function getSnapshot(): Promise<Snapshot> {
  // A token (e.g. on CI or Vercel) avoids the 60-requests-an-hour limit for anonymous calls.
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const get = (path: string) => fetch(`${API}${path}`, { headers }).catch(() => null);
  const [repoRes, releaseRes, langRes] = await Promise.all([get(""), get("/releases/latest"), get("/languages")]);
  return {
    repo: repoRes?.ok ? parseRepo(await repoRes.json()) : null,
    release: releaseRes?.ok ? parseRelease(await releaseRes.json()) : releaseRes?.status === 404 ? null : undefined,
    languages: langRes?.ok ? parseLanguages(await langRes.json()) : [],
  };
}
