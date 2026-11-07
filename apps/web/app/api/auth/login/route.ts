import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { config, OAUTH_COOKIE, origin, seal, setCookie } from "@/lib/server/session";

/** Sends the person to GitHub to sign in. */
export async function GET(req: NextRequest) {
  const cfg = config();
  if (!cfg) return NextResponse.redirect(new URL("/?error=not-configured", origin(req)));
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const url = new URL(`${cfg.githubWeb}/login/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", `${origin(req)}/api/auth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  const res = NextResponse.redirect(url);
  setCookie(res, req, OAUTH_COOKIE, seal({ state, verifier }, cfg.secret), 600);
  return res;
}
