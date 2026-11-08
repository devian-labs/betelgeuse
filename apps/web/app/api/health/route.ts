import { NextResponse } from "next/server";
import { fetchIndex } from "@/lib/server/plugin-store";

export const dynamic = "force-dynamic";

/**
 * For uptime checks (.github/workflows/uptime.yml). `GET /api/health` answers whether this deployment is set up;
 * `?deep=1` also reaches GitHub and the plugin store, which sign-in and installing plugins depend on.
 * 200 when everything is fine, 503 when something isn't. It never says what a setting is, only whether it's set.
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.has("deep");
  const checks: Record<string, boolean> = {
    githubApp: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.NEXT_PUBLIC_GITHUB_APP_SLUG),
    session: (process.env.SESSION_SECRET?.length ?? 0) >= 32,
  };
  if (deep) {
    const [github, store] = await Promise.all([
      fetch("https://api.github.com/zen", { signal: AbortSignal.timeout(5000), cache: "no-store" })
        .then((r) => r.ok)
        .catch(() => false),
      fetchIndex()
        .then((index) => !("error" in index))
        .catch(() => false),
    ]);
    checks.github = github;
    checks.pluginStore = store;
  }
  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      checks,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
