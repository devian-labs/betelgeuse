/** The page's side of signing in: fetches GitHub access tokens from this site's session. */
import { SignedOut } from "./github";

let cached: { token: string; expires: number | null } | null = null;

export async function accessToken(force = false): Promise<string> {
  if (!force && cached && (cached.expires === null || cached.expires - Date.now() > 60_000)) return cached.token;
  // GitHub's refresh tokens work once: tabs ask one at a time, so each sees the session the last one left.
  return navigator.locks ? navigator.locks.request("betelgeuse:token", () => fetchToken(force)) : fetchToken(force);
}

async function fetchToken(force: boolean): Promise<string> {
  const res = await fetch(`/api/auth/token${force ? "?force" : ""}`, { method: "POST", cache: "no-store" });
  if (res.status === 401) {
    cached = null;
    throw new SignedOut();
  }
  if (!res.ok) throw new Error("Couldn't reach Betelgeuse to sign in.");
  cached = (await res.json()) as { token: string; expires: number | null };
  return cached.token;
}

export const githubApi = () => process.env.NEXT_PUBLIC_GITHUB_API_URL || "https://api.github.com";
export const githubWeb = () => process.env.NEXT_PUBLIC_GITHUB_WEB_URL || "https://github.com";
/** Where people give the app access to more repositories. */
export const installUrl = () => `${githubWeb()}/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "betelgeuse-web"}/installations/new`;
export const newRepoUrl = () => `${githubWeb()}/new?name=notes&visibility=private`;

export const LAST_REPO = "betelgeuse:last-repo";
export const remembered = () => {
  try {
    return localStorage.getItem(LAST_REPO);
  } catch {
    return null;
  }
};
export const remember = (fullName: string | null) => {
  try {
    if (fullName) localStorage.setItem(LAST_REPO, fullName);
    else localStorage.removeItem(LAST_REPO);
  } catch {
    /* a convenience only */
  }
};
