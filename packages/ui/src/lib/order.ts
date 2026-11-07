// Manual page order. A page may carry `order: <number>` in its frontmatter; siblings (pages in the
// same folder) sort by it ascending, and pages without one come after every ordered sibling, A–Z.
// The MCP server (mcp/src/vault.ts) sorts its page list the same way.

/** `order` as a usable sort key: any finite number, anything else means "no manual position". */
export function orderOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Sibling comparator: ordered pages first by `order`, then everything else A–Z (ties A–Z too). */
export function compareSiblings(a: { order: number | null; title: string }, b: { order: number | null; title: string }): number {
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
  if (a.order !== null && b.order === null) return -1;
  if (a.order === null && b.order !== null) return 1;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export type Sibling = { path: string; order: number | null };

/**
 * Where a dragged page lands, as `order` values to write. `siblings` are the pages in one folder
 * in their visible order (including the dragged one); `gap` is the drop position among them, from
 * 0 (above the first) to `siblings.length` (below the last).
 *
 * Writes as little as possible:
 * - Dropped among ordered siblings, only the moved page changes: it takes a number between its
 *   neighbours (2 and 3 → 2.5, 1 and 4 → 3), or one past the end (last + 1, first − 1).
 * - The first time a folder is ordered (no sibling has `order` yet), every sibling is numbered
 *   1..n in the new visible order, so later drops have a stable frame.
 * - Dropped among the unordered pages that trail the ordered ones, those unordered pages (and
 *   the moved one) are numbered on from the last order, so they stay where they are shown.
 * - If the neighbours' numbers leave no room (equal orders), the ordered siblings are renumbered 1..k.
 *
 * Returns an empty object when the drop doesn't change anything.
 */
export function planReorder(siblings: Sibling[], moved: string, gap: number): Record<string, number> {
  const from = siblings.findIndex((s) => s.path === moved);
  if (from < 0 || gap === from || gap === from + 1) return {};
  const rest = siblings.filter((s) => s.path !== moved);
  const at = Math.max(0, Math.min(rest.length, gap > from ? gap - 1 : gap));
  // Visible order is always "ordered pages, then unordered ones", so the ordered ones are a prefix.
  let ordered = 0;
  while (ordered < rest.length && rest[ordered].order !== null) ordered++;

  const sequence = (next: Sibling[], start: number) => {
    const out: Record<string, number> = {};
    next.forEach((s, i) => {
      if (s.order !== start + i || s.path === moved) out[s.path] = start + i;
    });
    return out;
  };
  const target = [...rest.slice(0, at), { path: moved, order: null }, ...rest.slice(at)];

  if (ordered === 0) return sequence(target, 1);
  if (at > ordered) {
    // Number the unordered pages up to and including the moved one, continuing after the last order.
    const last = rest[ordered - 1].order!;
    return sequence(target.slice(ordered, at + 1), Math.floor(last) + 1);
  }
  const prev = at > 0 ? rest[at - 1].order! : null;
  const next = at < ordered ? rest[at].order! : null;
  const value = between(prev, next);
  if (value !== null) return { [moved]: value };
  return sequence(target.slice(0, ordered + 1), 1);
}

/** A number strictly between `lo` and `hi` (either may be open), preferring whole numbers. */
function between(lo: number | null, hi: number | null): number | null {
  if (lo === null && hi === null) return 1;
  if (lo === null) return Math.ceil(hi!) - 1;
  if (hi === null) return Math.floor(lo) + 1;
  const mid = (lo + hi) / 2;
  const round = Math.round(mid);
  if (round > lo && round < hi) return round;
  return mid > lo && mid < hi ? mid : null;
}

/**
 * The drop position nearest to `y` among sibling blocks (each a row plus its expanded sub-pages),
 * given their top and bottom edges in visible order. Gap `i` sits just above block `i`; gap `n`
 * is below the last block.
 */
export function nearestGap(blocks: { top: number; bottom: number }[], y: number): number {
  if (!blocks.length) return 0;
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i <= blocks.length; i++) {
    const edge = i < blocks.length ? blocks[i].top : blocks[blocks.length - 1].bottom;
    const d = Math.abs(y - edge);
    if (d < distance) [best, distance] = [i, d];
  }
  return best;
}
