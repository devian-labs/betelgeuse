import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")) as { version: string };
const dev = process.env.NODE_ENV !== "production";
const github = process.env.NEXT_PUBLIC_GITHUB_API_URL || "https://api.github.com";

/**
 * Pages hold a GitHub token and someone's notes, so where they can send anything is locked down:
 * this site, GitHub's API and Unsplash (cover photo search), and nowhere else, plugins included.
 * Images can come from anywhere, as pages embed them. Plugins are evaluated from their signed code,
 * which needs 'unsafe-eval'; Next.js's bootstrap scripts need 'unsafe-inline'.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${github} https://api.unsplash.com${dev ? " ws:" : ""}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The shared interface is TypeScript source, compiled by each app.
  transpilePackages: ["@betelgeuse/ui", "@betelgeuse/plugin-api"],
  env: { NEXT_PUBLIC_APP_VERSION: version },
  turbopack: {
    // npm workspaces hoist dependencies to the monorepo root, so Turbopack resolves from there.
    root: resolve(import.meta.dirname, "../.."),
    // The drag handle's optional collaboration support would bring in all of Yjs: see the stub.
    resolveAlias: { "@tiptap/y-tiptap": "../../packages/ui/src/editor/y-tiptap-stub.ts" },
  },
  // Don't write AGENTS.md / CLAUDE.md into the repo on `next dev`.
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
