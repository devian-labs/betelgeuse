import { NextResponse, type NextRequest } from "next/server";
import { config, exchange, origin, SESSION_COOKIE, setSession, unseal, type Session } from "@/lib/server/session";

const REFRESH_BEFORE = 5 * 60_000;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The access token for this person's session, for the page to call GitHub with. Same-origin only.
 * GitHub's tokens expire after hours and are refreshed here: `force` asks for a new one early, after
 * GitHub turned the current one down.
 */
export async function POST(req: NextRequest) {
  const cfg = config();
  if (!cfg) return json({ error: "not-configured" }, 503);
  const from = req.headers.get("origin");
  if (from !== origin(req) && req.nextUrl.origin !== from) return json({ error: "forbidden" }, 403);

  const session = unseal<Session>(req.cookies.get(SESSION_COOKIE)?.value, cfg.secret);
  if (!session) return json({ error: "signed-out" }, 401);
  const force = req.nextUrl.searchParams.has("force");
  const fresh = session.expires === null || session.expires - Date.now() > REFRESH_BEFORE;
  if (fresh && !force) return json({ token: session.token, expires: session.expires });

  const next = session.refresh ? await exchange(cfg, { grant_type: "refresh_token", refresh_token: session.refresh }) : null;
  if (!next) {
    // About to expire but still good, and not turned down: it does until refreshing works.
    if (!force && session.expires !== null && session.expires > Date.now()) return json({ token: session.token, expires: session.expires });
    const res = json({ error: "signed-out" }, 401);
    res.cookies.delete({ name: SESSION_COOKIE, path: "/api/auth" });
    return res;
  }
  const res = json({ token: next.token, expires: next.expires });
  setSession(res, req, next, cfg.secret);
  return res;
}
