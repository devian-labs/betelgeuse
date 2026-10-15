// Lists kept on this phone (Recents, Favorites), newest or first-added first.
const read = (key: string): string[] => {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const write = (key: string, list: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* a convenience only */
  }
};

export const RECENTS = "mobile-recents";
export const FAVORITES = "mobile-favorites";

export const readList = read;
export const writeList = write;

/** After a page moved or was renamed: the same list, following the page and its sub-pages to their new paths. */
export function remapPaths(list: string[], from: string, to: string): string[] {
  const [oldKey, newKey] = [from.replace(/\.md$/, ""), to.replace(/\.md$/, "")];
  return list.map((p) => (p === from ? to : p.startsWith(`${oldKey}/`) ? newKey + p.slice(oldKey.length) : p));
}

/** Whether `path` is `page` or one of its sub-pages. */
export const within = (path: string, page: string) => path === page || path.startsWith(page.replace(/\.md$/, "/"));
