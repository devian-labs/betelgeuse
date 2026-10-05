import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// A static export only prerenders route handlers marked static.
export const dynamic = "force-static";

/** Every indexable page, with the trailing slash the export serves (next.config.ts: trailingSlash). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy/`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
