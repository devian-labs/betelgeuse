"use client";

import { Download, GitFork, Puzzle, Rocket, Star, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { fetchStats, PLATFORMS, type Platform, type Stats } from "@/lib/stats";
import { OsIcon, type Os } from "./OsIcon";

const CACHE_KEY = "bg-stats";
const CACHE_MS = 30 * 60 * 1000;
const n = (v: number) => v.toLocaleString("en");
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "");
const short = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }) : "");
const OS_OF: Record<Platform, Os> = {
  "macOS (Apple Silicon)": "macOS",
  "macOS (Intel)": "macOS",
  Windows: "Windows",
  "Linux (x64)": "Linux",
  "Linux (ARM)": "Linux",
  Android: "Android",
};
// useLayoutEffect warns during the static build; the count-up only matters in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

/** Counts up to `value` once, unless the visitor prefers less motion. The page's HTML has the final number. */
function useCountUp(value: number, ms = 1400) {
  const [shown, setShown] = useState(value);
  useIsoLayoutEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) return setShown(value);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

/** A small seeded random, so the sky is the same in the built page and in the browser. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One star per download, or per 2, 5, 10… once there are too many to draw. */
function perStar(total: number) {
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (total / step <= 700) return step;
  return 10000;
}

/** Every download as a star; the newest release's are the bright ones. */
function Sky({ stats }: { stats: Stats }) {
  const step = perStar(stats.downloads);
  const latest = stats.releases.find((r) => !r.prerelease);
  const stars = useMemo(() => {
    const random = rng(42);
    const out: { x: number; y: number; r: number; o: number; fresh: boolean; twinkle: number | null }[] = [];
    for (const rel of [...stats.releases].reverse()) {
      const count = Math.round(rel.total / step);
      for (let i = 0; i < count; i++) {
        // Thinner towards the middle, where the number sits.
        let x = random() * 1000;
        let y = random() * 400;
        const dx = (x - 500) / 340;
        const dy = (y - 200) / 130;
        if (dx * dx + dy * dy < 1 && random() < 0.7) {
          x = random() * 1000;
          y = random() < 0.5 ? random() * 70 : 330 + random() * 70;
        }
        const fresh = rel === latest;
        out.push({ x, y, r: fresh ? 1.6 + random() * 1.8 : 0.7 + random() * 1.3, o: fresh ? 1 : 0.35 + random() * 0.5, fresh, twinkle: random() < 0.35 ? random() * 6 : null });
      }
    }
    return out;
  }, [stats.releases, step, latest]);
  const total = useCountUp(stats.downloads);

  return (
    <section className="sky" aria-label={`${n(stats.downloads)} downloads`}>
      <svg className="sky-stars" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            className={s.fresh ? "fresh" : undefined}
            style={{ opacity: s.o, animationDelay: s.twinkle === null ? undefined : `-${s.twinkle}s` }}
            data-twinkle={s.twinkle === null ? undefined : ""}
          />
        ))}
      </svg>
      <div className="sky-glow" aria-hidden />
      <div className="sky-copy">
        <span className="sky-kicker">Downloads so far</span>
        <strong className="sky-number">{n(total)}</strong>
        <span className="sky-legend">
          Every star here is {step === 1 ? "one download" : `${n(step)} downloads`}.
          {latest && latest.total > 0 && (
            <>
              {" "}
              The bright ones are <span className="sky-fresh-dot" aria-hidden /> {latest.version}.
            </>
          )}
        </span>
      </div>
    </section>
  );
}

function Tile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-icon" aria-hidden>
        {icon}
      </span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

/** One series of horizontal bars: label, bar, value. The bar's share of the total shows on hover. */
function Bars({ title, rows, total }: { title: string; rows: { label: string; icon?: ReactNode; sub?: string; value: number }[]; total: number }) {
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
                {r.icon && (
                  <span className="bar-icon" aria-hidden>
                    {r.icon}
                  </span>
                )}
                <span>
                  {r.label}
                  {r.sub && <span className="bar-sub">{r.sub}</span>}
                </span>
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.max((r.value / max) * 100, r.value ? 1.5 : 0)}%` }} />
                <span className="bar-tip" role="tooltip">
                  {n(r.value)} · {share}% of {n(total)}
                </span>
              </span>
              <span className="bar-value">
                {n(r.value)}
                <span className="bar-share">{share}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** Releases as a timeline, newest at the top. Each release's star grows with its downloads (by area). */
function Timeline({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...stats.releases.map((r) => r.total));
  return (
    <ol className="timeline">
      {stats.releases.map((r, i) => {
        const share = stats.downloads ? Math.round((r.total / stats.downloads) * 100) : 0;
        const size = 10 + Math.sqrt(r.total / max) * 22;
        return (
          <li key={r.version} className={i === 0 ? "latest" : undefined}>
            <span className="tl-date">{day(r.date)}</span>
            <span className="tl-node" aria-hidden>
              <span style={{ width: size, height: size }} />
            </span>
            <div className="tl-body">
              <a href={r.url} className="tl-version">
                {r.version}
              </a>
              {i === 0 && <span className="tl-badge">Latest</span>}
              {r.prerelease && <span className="tl-badge tl-pre">Preview</span>}
              <span className="tl-count">
                <strong>{n(r.total)}</strong> downloads · {share}%
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StatsView({ initial }: { initial: Stats | null }) {
  const stats = useStats(initial);
  if (!stats) return <p>GitHub couldn&apos;t be reached just now. Try again in a minute.</p>;

  const latest = stats.releases.find((r) => !r.prerelease);
  const pluginTotal = stats.plugins.reduce((a, p) => a + p.downloads, 0);
  const shown = PLATFORMS.filter((p) => stats.releases.some((r) => r.byPlatform[p]));
  const top = stats.byPlatform[0];

  return (
    <>
      <Sky stats={stats} />

      <div className="stat-tiles">
        {latest && <Tile icon={<Rocket size={16} />} label="Latest release" value={n(latest.total)} hint={`${latest.version}, since ${short(latest.date)}`} />}
        <Tile icon={<Download size={16} />} label="Releases" value={n(stats.releases.length)} hint={stats.releases.at(-1) ? `since ${short(stats.releases.at(-1)!.date)}` : undefined} />
        {stats.stars !== null && <Tile icon={<Star size={16} />} label="GitHub stars" value={n(stats.stars)} hint="a star for a star" />}
        {stats.forks !== null && <Tile icon={<GitFork size={16} />} label="Forks" value={n(stats.forks)} />}
        {stats.contributors !== null && <Tile icon={<Users size={16} />} label="Contributors" value={n(stats.contributors)} />}
        <Tile icon={<Puzzle size={16} />} label="Plugin installs" value={n(pluginTotal)} />
      </div>

      <h2>Where it runs</h2>
      {top && (
        <p className="stats-lead">
          {top.platform} leads, with {Math.round((top.downloads / Math.max(1, stats.downloads)) * 100)}% of every download.
        </p>
      )}
      <Bars
        title="Installers downloaded, every release"
        rows={stats.byPlatform.map((p) => ({ label: p.platform, icon: <OsIcon os={OS_OF[p.platform]} size={16} />, value: p.downloads }))}
        total={stats.downloads}
      />

      <h2>Release by release</h2>
      <Timeline stats={stats} />

      {stats.plugins.length > 0 && (
        <>
          <h2>Plugins</h2>
          <Bars title="Plugin downloads from the store" rows={stats.plugins.map((p) => ({ label: p.id, icon: <Puzzle size={15} />, value: p.downloads }))} total={pluginTotal} />
        </>
      )}

      <details className="stats-details">
        <summary>Every number, release by platform</summary>
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
      </details>

      <p className="doc-meta">
        From GitHub, as of {new Date(stats.at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}. Counts are installer downloads from GitHub
        Releases; in-app updates and builds from source aren&apos;t included.
      </p>
    </>
  );
}
