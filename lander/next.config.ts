import type { NextConfig } from "next";

// GitHub Pages serves the site from /betelgeuse. The Pages workflow passes the prefix in
// PAGES_BASE_PATH (empty with a custom domain); `npm run dev` serves it from the root.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The repo root has its own package-lock.json; keep Next from treating it as the workspace root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
