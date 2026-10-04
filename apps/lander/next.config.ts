import { resolve } from "node:path";
import type { NextConfig } from "next";

// A static export (apps/lander/out), deployed on Vercel.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // npm workspaces hoist dependencies (next included) to the monorepo root, so Turbopack resolves from there.
  turbopack: { root: resolve(import.meta.dirname, "../..") },
  // Don't write AGENTS.md / CLAUDE.md into the repo on `next dev`.
  agentRules: false,
};

export default nextConfig;
