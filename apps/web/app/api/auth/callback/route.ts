import { NextResponse, type NextRequest } from "next/server";
import { config, exchange, OAUTH_COOKIE, origin, setSession, unseal } from "@/lib/server/session";

/** GitHub sends the person back here with a code, which becomes the session. */
export async function GET(req: NextRequest) {
  const cfg = config();
  const home = (error?: string) => new URL(error ? `/?error=${error}` : "/", origin(req));
  if (!cfg) return NextResponse.redirect(home("not-configured"));
  const code = req.nextUrl.searchParams.get("code");
  // Coming back from installing the app on a repository, already signed in.
  if (!code && req.nextUrl.searchParams.has("installation_id")) return NextResponse.redirect(home());
  const pending = unseal<{ state: string; verifier: string }>(req.cookies.get(OAUTH_COOKIE)?.value, cfg.secret);
  if (!code || !pending || req.nextUrl.searchParams.get("state") !== pending.state) return NextResponse.redirect(home("sign-in-failed"));
  const session = await exchange(cfg, { code, code_verifier: pending.verifier, redirect_uri: `${origin(req)}/api/auth/callback` });
  if (!session) return NextResponse.redirect(home("sign-in-failed"));
  const res = NextResponse.redirect(home());
  setSession(res, req, session, cfg.secret);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}
