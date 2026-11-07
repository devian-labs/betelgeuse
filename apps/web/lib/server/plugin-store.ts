/** The plugin store's list, fetched from the latest release. Nothing personal passes through here. */
const DEFAULT_INDEX = "https://github.com/devian-labs/betelgeuse/releases/latest/download/plugins.json";
export const MAX_ZIP = 25 * 1024 * 1024;

export const indexUrl = () => process.env.BETELGEUSE_PLUGIN_INDEX?.trim() || DEFAULT_INDEX;

type Entry = { id: string; url: string; [key: string]: unknown };

export async function fetchIndex(): Promise<{ plugins: Entry[] } | { error: string; status: number }> {
  let res: Response;
  try {
    res = await fetch(indexUrl(), { next: { revalidate: 900 } });
  } catch {
    return { error: "Couldn't reach the plugin store.", status: 502 };
  }
  if (res.status === 404) return { error: "The plugin store isn't published yet: plugins appear here after the next release.", status: 404 };
  if (!res.ok) return { error: "Couldn't reach the plugin store.", status: 502 };
  const data = (await res.json().catch(() => null)) as { plugins?: Entry[] } | null;
  if (!Array.isArray(data?.plugins)) return { error: "The plugin store's index is malformed.", status: 502 };
  return { plugins: data.plugins.filter((e) => typeof e.id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(e.id)) };
}

/**
 * Where a store entry's zip is. The list comes from the release, so its URLs are trusted only as far
 * as staying beside it: this route can't be pointed at anything else on the internet.
 */
export function zipUrl(entry: Entry): URL | null {
  const index = new URL(indexUrl());
  const url = new URL(entry.url, index);
  const sameRelease = url.origin === index.origin && (url.pathname.startsWith(index.pathname.replace(/[^/]*$/, "")) || url.pathname.startsWith("/devian-labs/betelgeuse/releases/"));
  return sameRelease ? url : null;
}
