import type { Metadata } from "next";
import { PlainPage } from "@/components/PlainPage";
import { StatsView } from "@/components/Stats";
import { SITE_NAME, SITE_URL, jsonLd, pageMetadata } from "@/lib/site";
import { fetchStats } from "@/lib/stats";

export const metadata: Metadata = pageMetadata({
  title: "Stats: Downloads, Stars and Releases | Betelgeuse",
  description: "How many people download Betelgeuse, on which platforms, release by release. Live from GitHub.",
  path: "/stats/",
});

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Stats", item: `${SITE_URL}/stats/` },
  ],
};

/** Betelgeuse in numbers, in the open. Built with GitHub's numbers, refreshed in the browser (components/Stats.tsx). */
export default async function StatsPage() {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  // Ten minutes, so a build never shows numbers from an old build's cache (lib/github.ts says why).
  const initial = await fetchStats({ headers, next: { revalidate: 600 } });
  return (
    <PlainPage title="Stats" wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs)} />
      <h1>Betelgeuse in numbers</h1>
      <p className="stats-intro">Built in the open, counted in the open. Live from GitHub, release by release.</p>
      <StatsView initial={initial} />
    </PlainPage>
  );
}
