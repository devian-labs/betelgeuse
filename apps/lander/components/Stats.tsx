"use client";

import { useEffect, useState } from "react";
import { fetchStats, PLATFORMS, type Stats } from "@/lib/stats";

const CACHE_KEY = "bg-stats";
const CACHE_MS = 30 * 60 * 1000;
const n = (v: number) => v.toLocaleString("en");
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "");

/** The build's numbers first, then GitHub's current ones (kept for 30 minutes, so reloads don't spend the API limit). */
function useStats(initial: Stats | null) {
  const [stats, setStats] = useState(initial);
  useEffect(() => {
    try {
      const hit = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
      if (hit && Date.now() - hit.at < CACHE_MS) return setStats(hit.value);
    } catch {}
    void fetchStats().then((s) => {
      if (!s) return;
      setStats(s);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value: s }));
      } catch {}
    });
  }, []);
  return stats;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

/** One series of horizontal bars: label, bar, value. The bar's share of the total shows on hover. */
function Bars({ title, rows, total }: { title: string; rows: { label: string; sub?: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="bars">
      <figcaption>{title}</figcaption>
      <ul>
        {rows.map((r) => {
          const share = total ? Math.round((r.value / total) * 100) : 0;
          return (
            <li key={r.label} tabIndex={0} aria-label={`${r.label}: ${n(r.value)} (${share}%)`}>
              <span className="bar-label">
                {r.label}
                {r.sub && <span className="bar-sub">{r.sub}</span>}
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.max((r.value / max) * 100, r.value ? 1.5 : 0)}%` }} />
                <span className="bar-tip" role="tooltip">
                  {n(r.value)} · {share}% of {n(total)}
                </span>
              </span>
              <span className="bar-value">{n(r.value)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function StatsView({ initial }: { initial: Stats | null }) {
  const stats = useStats(initial);
  if (!stats) return <p>GitHub couldn&apos;t be reached just now. Try again in a minute.</p>;

  const latest = stats.releases.find((r) => !r.prerelease);
  const pluginTotal = stats.plugins.reduce((a, p) => a + p.downloads, 0);
  const shown = PLATFORMS.filter((p) => stats.releases.some((r) => r.byPlatform[p]));

  return (
    <>
      <div className="stat-tiles">
        <Tile label="Downloads" value={n(stats.downloads)} hint={`across ${stats.releases.length} releases`} />
        {latest && <Tile label={`${latest.version} downloads`} value={n(latest.total)} hint={`since ${day(latest.date)}`} />}
        {stats.stars !== null && <Tile label="Stars" value={n(stats.stars)} />}
        {stats.forks !== null && <Tile label="Forks" value={n(stats.forks)} />}
        {stats.contributors !== null && <Tile label="Contributors" value={n(stats.contributors)} />}
        <Tile label="Plugin downloads" value={n(pluginTotal)} />
      </div>

      <h2>Downloads by platform</h2>
      <Bars title="Installers downloaded, every release" rows={stats.byPlatform.map((p) => ({ label: p.platform, value: p.downloads }))} total={stats.downloads} />

      <h2>Downloads by release</h2>
      <Bars
        title="Installers downloaded, newest release first"
        rows={stats.releases.map((r) => ({ label: r.version, sub: day(r.date), value: r.total }))}
        total={stats.downloads}
      />

      {stats.plugins.length > 0 && (
        <>
          <h2>Plugins</h2>
          <Bars title="Plugin downloads from the store" rows={stats.plugins.map((p) => ({ label: p.id, value: p.downloads }))} total={pluginTotal} />
        </>
      )}

      <h2>Every release, by platform</h2>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">Release</th>
              {shown.map((p) => (
                <th key={p} scope="col">
                  {p}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {stats.releases.map((r) => (
              <tr key={r.version}>
                <th scope="row">
                  <a href={r.url}>{r.version}</a>
                  <span className="bar-sub">{day(r.date)}</span>
                </th>
                {shown.map((p) => (
                  <td key={p}>{r.byPlatform[p] ? n(r.byPlatform[p]!) : "–"}</td>
                ))}
                <td>
                  <strong>{n(r.total)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="doc-meta">
        From GitHub, as of {new Date(stats.at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}. Counts are installer downloads from GitHub
        Releases; in-app updates and builds from source aren&apos;t included.
      </p>
    </>
  );
}
