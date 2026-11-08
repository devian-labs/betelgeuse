import type { Instrumentation } from "next";
import { scrub, scrubUrl } from "@betelgeuse/ui/lib/scrub";

/**
 * Errors in this site's own server routes (sign-in, the plugin store), to PostHog's error tracking. The
 * browser reports its own errors through components/Telemetry.tsx. Only when NEXT_PUBLIC_POSTHOG_KEY is set.
 * Sign-in callbacks carry an OAuth code and cookies carry the session, so only the scrubbed path is sent.
 */
export function register() {}

const host = () => `https://${process.env.POSTHOG_REGION === "eu" ? "eu" : "us"}.i.posthog.com`;

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const frames = (err.stack ?? "")
    .split("\n")
    .slice(1, 40)
    .map((line) => line.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/))
    .filter((m) => m !== null)
    .map((m) => ({
      platform: "node:javascript",
      function: m[1] ?? "?",
      filename: scrub(m[2].replace(/^.*\/(\.next|node_modules)\//, "$1/")),
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !m[2].includes("node_modules"),
    }))
    .reverse();
  await fetch(`${host()}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: "$exception",
      // Server errors belong to no one: they're counted, not tied to a visitor.
      distinct_id: "web-server",
      properties: {
        $exception_level: "error",
        $exception_list: [{ type: err.name, value: scrub(err.message), mechanism: { handled: false, synthetic: false }, stacktrace: { type: "raw", frames } }],
        where: "server",
        route: context.routePath,
        method: request.method,
        path: scrubUrl(`https://x${request.path}`)?.slice("https://x".length),
        platform: "web",
        app_version: process.env.NEXT_PUBLIC_APP_VERSION,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        $process_person_profile: false,
      },
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
};
