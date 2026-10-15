/** What the slash menu searches on. */
export type Searchable = { id: string; title: string; keywords?: string; section?: string };

const words = (s: string) => s.toLowerCase().split(/[\s\-_/]+/).filter(Boolean);
const squash = (s: string) => s.toLowerCase().replace(/[\s\-_/]+/g, "");

/**
 * How well `item` answers `query`, best first (0), or -1 for no match. Short forms work as in
 * Notion: the command's id or initials ("h3", "todo", "bl" for Bulleted list), the title typed
 * without spaces ("heading3"), and the start of each word ("num li").
 */
export function commandScore(item: Searchable, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const title = words(item.title);
  // Initials, keeping numbers whole: "Heading 3" → "h3", "2 columns" → "2c".
  const initials = title.map((w) => (/^\d+$/.test(w) ? w : w[0])).join("");
  // From two letters up: one letter is the start of many titles, which keep the menu's order.
  if (q.length > 1 && (item.id.toLowerCase() === q || initials === q)) return 0;
  if (squash(item.title).startsWith(squash(q))) return 1;
  const tokens = words(q);
  const prefixOf = (pool: string[]) => tokens.every((t) => pool.some((w) => w.startsWith(t)));
  if (prefixOf(title)) return 2;
  if (prefixOf([...title, ...words(item.keywords ?? ""), ...words(item.section ?? ""), ...words(item.id)])) return 3;
  if (`${item.title} ${item.keywords ?? ""} ${item.section ?? ""}`.toLowerCase().includes(q)) return 4;
  return -1;
}

/** The items matching `query`, best matches first (ties keep the menu's order). */
export function searchCommands<T extends Searchable>(items: T[], query: string): T[] {
  return items
    .map((item, i) => ({ item, i, score: commandScore(item, query) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((m) => m.item);
}
