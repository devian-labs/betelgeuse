#!/usr/bin/env node
/**
 * How Betelgeuse is doing, from GitHub: downloads of every release by platform, stars and forks, and the
 * repository's traffic (views, clones, the sites people arrive from, the pages they read). Nothing here
 * comes from anyone's device. Run daily by .github/workflows/stats.yml.
 *
 *   node scripts/stats.mjs                 # prints a Markdown report
 *
 * Environment:
 *   GITHUB_TOKEN          reads the releases; traffic needs a token with push access (STATS_TOKEN in CI)
 *   POSTHOG_KEY           also sends the numbers to PostHog, as events from "github-stats"
 *   POSTHOG_HOST          default https://us.i.posthog.com
 *   GITHUB_STEP_SUMMARY   also writes the report there (set by GitHub Actions)
 *
 * GitHub keeps traffic for 14 days only, so the daily events in PostHog are its history.
 */
import { appendFileSync } from "node:fs";

const REPO = process.env.GITHUB_REPOSITORY || "devian-labs/betelgeuse";
const token = process.env.GITHUB_TOKEN;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "betelgeuse-stats", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Which platform a release file is for. */
export function platformOf(name) {
  if (/\.dmg$/.test(name)) return /aarch64/.test(name) ? "macOS (Apple Silicon)" : "macOS (Intel)";
  if (/\.(exe|msi)$/.test(name)) return "Windows";
  if (/\.apk$/.test(name)) return "Android";
  if (/\.(AppImage|deb|rpm)$/.test(name)) return /aarch64|arm64/.test(name) ? "Linux (ARM)" : "Linux (x64)";
  if (/^plugin-.*\.zip$/.test(name)) return "Plugin";
  // Updater bundles, signatures, latest.json, plugins.json: fetched by installed apps, not people.
  return null;
}

async function releases() {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/releases?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((r) => !r.draft);
}

async function main() {
  const [repo, rels] = await Promise.all([gh(""), releases()]);
  const traffic = await Promise.all([gh("/traffic/views"), gh("/traffic/clones"), gh("/traffic/popular/referrers"), gh("/traffic/popular/paths")]).catch((e) => {
    console.error(`No traffic (needs a token with push access): ${e.message.split("\n")[0]}`);
    return null;
  });

  const byPlatform = {};
  const byRelease = [];
  const plugins = {};
  for (const r of rels) {
    let total = 0;
    for (const a of r.assets) {
      const platform = platformOf(a.name);
      if (!platform) continue;
      if (platform === "Plugin") {
        const id = a.name.replace(/^plugin-/, "").replace(/-\d.*$/, "");
        plugins[id] = (plugins[id] ?? 0) + a.download_count;
        continue;
      }
      byPlatform[platform] = (byPlatform[platform] ?? 0) + a.download_count;
      total += a.download_count;
    }
    byRelease.push({ version: r.tag_name, date: r.published_at?.slice(0, 10), downloads: total, prerelease: r.prerelease });
  }
  // Each installed app checks plugins.json for plugin updates: a rough count of apps using the store.
  const latest = rels.find((r) => !r.prerelease);
  const storeChecks = latest?.assets.find((a) => a.name === "plugins.json")?.download_count ?? 0;
  const updaterReady = !!latest?.assets.some((a) => a.name === "latest.json");
  const totalDownloads = Object.values(byPlatform).reduce((a, b) => a + b, 0);

  const [views, clones, referrers, paths] = traffic ?? [];
  const lines = [
    `## Betelgeuse stats, ${new Date().toISOString().slice(0, 10)}`,
    "",
    `**${totalDownloads.toLocaleString("en")}** downloads across ${byRelease.length} releases · ${repo.stargazers_count} stars · ${repo.forks_count} forks · ${repo.subscribers_count} watching · ${repo.open_issues_count} open issues and PRs`,
    "",
    "| Platform | Downloads |",
    "| --- | ---: |",
    ...Object.entries(byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `| ${p} | ${n} |`),
    "",
    "| Release | Published | Downloads |",
    "| --- | --- | ---: |",
    ...byRelease.slice(0, 10).map((r) => `| ${r.version}${r.prerelease ? " (pre)" : ""} | ${r.date ?? ""} | ${r.downloads} |`),
    "",
    `Plugin downloads: ${Object.entries(plugins).map(([id, n]) => `${id} ${n}`).join(", ") || "none"} · plugin store checks on ${latest?.tag_name ?? "—"}: ${storeChecks}`,
    updaterReady ? "" : `\n> [!WARNING]\n> ${latest?.tag_name ?? "The latest release"} has no latest.json, so installed apps can't find updates. Check the TAURI_SIGNING_PRIVATE_KEY secret.`,
  ];
  if (traffic) {
    lines.push(
      "",
      `### Last 14 days on GitHub`,
      "",
      `${views.count} views (${views.uniques} people) · ${clones.count} clones (${clones.uniques} people)`,
      "",
      "| Arriving from | Views | People |",
      "| --- | ---: | ---: |",
      ...referrers.map((r) => `| ${r.referrer} | ${r.count} | ${r.uniques} |`),
      "",
      "| Most read | Views |",
      "| --- | ---: |",
      ...paths.slice(0, 8).map((p) => `| ${p.path.replace(`/${REPO}`, "") || "/"} | ${p.count} |`),
    );
  }
  const report = lines.join("\n") + "\n";
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

  if (process.env.POSTHOG_KEY) {
    const timestamp = new Date().toISOString();
    const event = (name, properties) => ({ event: name, distinct_id: "github-stats", timestamp, properties: { ...properties, $process_person_profile: false } });
    const yesterday = (list) => list?.find((d) => d.timestamp.slice(0, 10) === new Date(Date.now() - 864e5).toISOString().slice(0, 10));
    const batch = [
      event("github_repo", {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.subscribers_count,
        open_issues: repo.open_issues_count,
        downloads_total: totalDownloads,
        plugin_store_checks: storeChecks,
        updater_ready: updaterReady,
      }),
      ...Object.entries(byPlatform).map(([platform, downloads]) => event("github_downloads", { platform, downloads })),
      ...byRelease.slice(0, 5).map((r) => event("github_release_downloads", { version: r.version, downloads: r.downloads })),
      ...Object.entries(plugins).map(([plugin, downloads]) => event("github_plugin_downloads", { plugin, downloads })),
    ];
    if (traffic) {
      // Yesterday's complete day, so each day is sent once.
      const v = yesterday(views.views);
      const c = yesterday(clones.clones);
      batch.push(event("github_traffic_day", { views: v?.count ?? 0, viewers: v?.uniques ?? 0, clones: c?.count ?? 0, cloners: c?.uniques ?? 0 }));
      batch.push(...referrers.map((r) => event("github_referrer", { referrer: r.referrer, views_14d: r.count, people_14d: r.uniques })));
    }
    const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
    const res = await fetch(`${host}/batch/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.POSTHOG_KEY, batch }) });
    if (!res.ok) throw new Error(`PostHog: ${res.status} ${await res.text()}`);
    console.error(`Sent ${batch.length} events to PostHog.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
