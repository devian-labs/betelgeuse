import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// A static export only prerenders route handlers marked static.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
