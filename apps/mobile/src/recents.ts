// Recently opened pages, newest first, kept on this phone.
const KEY = "mobile-recents";

export function readRecents(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecent(path: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([path, ...readRecents().filter((p) => p !== path)].slice(0, 10)));
  } catch {
    /* a convenience only */
  }
}
