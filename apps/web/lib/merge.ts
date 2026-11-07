import { diff3Merge } from "node-diff3";

/**
 * Merges two versions of a text file line by line, as git does: edits to different parts of a page
 * both survive. Null when they touch the same lines, so the caller keeps both versions.
 */
export function mergeText(base: string, ours: string, theirs: string): string | null {
  const lines = (s: string) => s.split("\n");
  const out: string[] = [];
  for (const chunk of diff3Merge(lines(ours), lines(base), lines(theirs), { excludeFalseConflicts: true })) {
    if (chunk.conflict) return null;
    out.push(...(chunk.ok ?? []));
  }
  return out.join("\n");
}

/** `Notes/Plan.md` → `Notes/Plan (conflicted copy).md`, numbered if that's taken too. */
export function conflictedCopyPath(path: string, taken: (candidate: string) => boolean) {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const [stem, ext] = dot > slash + 1 ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${stem} (conflicted copy)${ext}` : `${stem} (conflicted copy ${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
}
