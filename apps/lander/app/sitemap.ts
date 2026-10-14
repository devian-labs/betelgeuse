import type { MetadataRoute } from "next";
import { ALL, href } from "@/lib/docs";
import { SITE_URL } from "@/lib/site";

// A static export only prerenders route handlers marked static.
export const dynamic = "force-static";

/** Every indexable page, with the trailing slash the export serves (next.config.ts: trailingSlash). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy/`, changeFrequency: "yearly", priority: 0.3 },
    ...ALL.map((e) => ({ url: `${SITE_URL}${href(e.slug)}`, changeFrequency: "monthly" as const, priority: e.slug ? 0.6 : 0.8 })),
  ];
}
