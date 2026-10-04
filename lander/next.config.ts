import type { NextConfig } from "next";

// A static export (lander/out), deployed on Vercel.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The repo root has its own package-lock.json; keep Next from treating it as the workspace root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
