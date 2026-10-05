import type { MetadataRoute } from "next";

// A static export only prerenders route handlers marked static.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Betelgeuse",
    short_name: "Betelgeuse",
    description: "A free, open-source workspace for notes, docs and databases, stored as Markdown files in git.",
    start_url: "/",
    display: "browser",
    background_color: "#fffdfb",
    theme_color: "#141110",
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
