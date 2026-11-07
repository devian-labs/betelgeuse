/**
 * Signing in with GitHub, without a database. The session is a cookie the browser can't read, sealed
 * with SESSION_SECRET, holding only GitHub's tokens: nothing about anyone's notes ever reaches the
 * server. The page asks /api/auth/token for a short-lived access token and talks to GitHub itself.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export type Session = {
  /** The access token and when it expires (unix millis; null for tokens that don't). */
  token: string;
  expires: number | null;
  refresh: string | null;
};

export const SESSION_COOKIE = "bg_session";
export const OAUTH_COOKIE = "bg_oauth";
const SESSION_DAYS = 180; // GitHub's refresh tokens last about six months

const key = (secret: string) => createHash("sha256").update(secret).digest();

export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined, secret: string): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null; // tampered with, or sealed with an old secret: same as not signed in
  }
}

export type Config = { clientId: string; clientSecret: string; secret: string; githubWeb: string };

/** The server's settings, or null until they're set (see apps/web/README.md). */
export function config(): Config | null {
  const [clientId, clientSecret, secret] = [process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET, process.env.SESSION_SECRET];
  if (!clientId || !clientSecret || !secret) return null;
  return { clientId, clientSecret, secret, githubWeb: (process.env.GITHUB_WEB_URL ?? "https://github.com").replace(/\/$/, "") };
}

export const origin = (req: NextRequest) => process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;

/** Cookies for /api/auth only: no other route needs them, and pages can't read them. */
export function setCookie(res: NextResponse, req: NextRequest, name: string, value: string, maxAge: number) {
  res.cookies.set(name, value, { httpOnly: true, sameSite: "lax", secure: origin(req).startsWith("https:"), path: "/api/auth", maxAge });
}
export const setSession = (res: NextResponse, req: NextRequest, session: Session, secret: string) => setCookie(res, req, SESSION_COOKIE, seal(session, secret), SESSION_DAYS * 24 * 3600);

/** Asks GitHub for tokens: exchanging a sign-in code, or refreshing. */
export async function exchange(cfg: Config, grant: Record<string, string>, now = Date.now()): Promise<Session | null> {
  const res = await fetch(`${cfg.githubWeb}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...grant }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string } | null;
  if (!res.ok || !data?.access_token) return null;
  return { token: data.access_token, expires: data.expires_in ? now + data.expires_in * 1000 : null, refresh: data.refresh_token ?? null };
}
