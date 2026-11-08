// The numbers on /stats/, all public on GitHub: downloads by platform, release and plugin, and the repository's
// stars, forks and contributors. Fetched at build time, then refreshed in the browser (components/Stats.tsx).
// scripts/stats.mjs counts downloads the same way; keep the two in step.
import { API } from "./github";

export const PLATFORMS = ["macOS (Apple Silicon)", "macOS (Intel)", "Windows", "Linux (x64)", "Linux (ARM)", "Android"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type ReleaseStats = { version: string; date: string; url: string; prerelease: boolean; total: number; byPlatform: Partial<Record<Platform, number>> };
export type Stats = {
  downloads: number;
  byPlatform: { platform: Platform; downloads: number }[];
  releases: ReleaseStats[];
  plugins: { id: string; downloads: number }[];
  stars: number | null;
  forks: number | null;
  contributors: number | null;
  /** When GitHub was asked. */
  at: string;
};

/** Which platform an installer is for; null for what installed apps fetch on their own (updates, signatures, plugin store). */
export function platformOf(name: string): Platform | null {
  if (/\.dmg$/.test(name)) return /aarch64|arm64/.test(name) ? "macOS (Apple Silicon)" : "macOS (Intel)";
  if (/\.(exe|msi)$/.test(name)) return "Windows";
  if (/\.apk$/.test(name)) return "Android";
  if (/\.(AppImage|deb|rpm)$/.test(name)) return /aarch64|arm64/.test(name) ? "Linux (ARM)" : "Linux (x64)";
  return null;
}

type GhRelease = { tag_name: string; published_at: string | null; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string; download_count: number }[] };
type GhRepo = { stargazers_count: number; forks_count: number };

export function computeStats(releases: GhRelease[], repo: GhRepo | null, contributors: number | null): Stats {
  const totals: Partial<Record<Platform, number>> = {};
  const plugins: Record<string, number> = {};
  const rows: ReleaseStats[] = [];
  for (const r of releases) {
    if (r.draft) continue;
    const row: ReleaseStats = { version: r.tag_name, date: r.published_at ?? "", url: r.html_url, prerelease: r.prerelease, total: 0, byPlatform: {} };
    for (const a of r.assets) {
      const plugin = a.name.match(/^plugin-(.+?)-\d[\w.-]*\.zip$/);
      if (plugin) {
        plugins[plugin[1]] = (plugins[plugin[1]] ?? 0) + a.download_count;
        continue;
      }
      const p = platformOf(a.name);
      if (!p) continue;
      row.byPlatform[p] = (row.byPlatform[p] ?? 0) + a.download_count;
      totals[p] = (totals[p] ?? 0) + a.download_count;
      row.total += a.download_count;
    }
    rows.push(row);
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return {
    downloads: rows.reduce((n, r) => n + r.total, 0),
    byPlatform: PLATFORMS.map((platform) => ({ platform, downloads: totals[platform] ?? 0 }))
      .filter((p) => p.downloads > 0)
      .sort((a, b) => b.downloads - a.downloads),
    releases: rows,
    plugins: Object.entries(plugins)
      .map(([id, downloads]) => ({ id, downloads }))
      .sort((a, b) => b.downloads - a.downloads),
    stars: repo?.stargazers_count ?? null,
    forks: repo?.forks_count ?? null,
    contributors,
    at: new Date().toISOString(),
  };
}

/** Asks GitHub for everything /stats/ shows. `init` adds a token and cache limits at build time. */
export async function fetchStats(init: RequestInit & { next?: { revalidate: number } } = {}): Promise<Stats | null> {
  const get = (path: string) => fetch(`${API}${path}`, init).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [releases, repo, contributors] = await Promise.all([get("/releases?per_page=100"), get(""), get("/contributors?per_page=100&anon=0")]);
  if (!Array.isArray(releases)) return null;
  return computeStats(releases, repo, Array.isArray(contributors) ? contributors.length : null);
}
