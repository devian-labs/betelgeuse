import { useEffect, useState } from "react";
import { api, type Pipeline } from "./api";
import { getString, readFrontmatter, splitNote } from "./frontmatter";
import { refreshStudio, useStudio } from "./studio";
import { useVault } from "./vault";

/** A video (or post) in the pipeline database, with the project folder its files live in. */
export type Production = {
  path: string;
  title: string;
  channel: string | null;
  status: string | null;
  /** Library folder id, e.g. `Studio/YouTube/AgileCoder/Vibe Coding`. */
  folder: string | null;
};

export async function savePipeline(patch: Partial<Pipeline>) {
  const status = await api.libraryStatus();
  await api.librarySetSettings({ ...status.settings, pipeline: { ...status.settings.pipeline, ...patch } });
  await refreshStudio();
}

export async function loadProductions(pipeline: Pipeline): Promise<Production[]> {
  if (!pipeline.database) return [];
  const rows = await api.databaseRows(pipeline.database).catch(() => []);
  return rows.map((r) => {
    const fm = readFrontmatter(splitNote(r.content).frontmatter);
    return {
      path: r.path,
      title: r.title,
      channel: getString(fm, pipeline.channelProperty) ?? null,
      status: getString(fm, "Status") ?? null,
      folder: getString(fm, pipeline.folderProperty)?.replace(/\/+$/, "") || null,
    };
  });
}

/** The pipeline's productions, reloaded when pages change. */
export function useProductions() {
  const { status } = useStudio();
  const { refreshKey } = useVault();
  const pipeline = status?.settings.pipeline;
  const [list, setList] = useState<Production[]>([]);
  const key = JSON.stringify(pipeline ?? null);
  useEffect(() => {
    if (!pipeline?.database || !status?.settings.enabled) return setList([]);
    let live = true;
    loadProductions(pipeline).then((l) => live && setList(l));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey, status?.settings.enabled]);
  return list;
}

/** The production a library file belongs to: the one whose project folder holds it (deepest wins). */
export function productionOf(assetId: string, productions: Production[]): Production | null {
  let best: Production | null = null;
  for (const p of productions) {
    if (p.folder && assetId.startsWith(`${p.folder}/`) && (!best || p.folder.length > best.folder!.length)) best = p;
  }
  return best;
}

/** Where a production's project folder goes: its channel's folder, else the default. */
export const homeFolder = (pipeline: Pipeline, channel: string | null) => (channel && pipeline.channelFolders[channel]) || pipeline.defaultFolder || null;

/** Words that name the channel rather than the video: the channel value and its folder's path. */
export const channelNoise = (pipeline: Pipeline, channel: string | null) => [channel ?? "", ...(homeFolder(pipeline, channel)?.split("/") ?? [])];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const wordSet = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1 || /\d/.test(w)));

/**
 * How well a folder name matches a title, 0–1: 1 for the same words, less for partial overlaps.
 * `noise` words (the channel's name, say) don't count against a match: "Channel Trailer - Smrutify"
 * is the "Channel Trailer" folder in Smrutify's folder.
 */
export function matchScore(title: string, folder: string, noise: Set<string> = new Set()) {
  if (norm(title) === norm(folder)) return 1;
  const a = wordSet(title);
  noise.forEach((w) => a.size > 1 && a.delete(w));
  const b = wordSet(folder);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((w) => b.has(w) && shared++);
  return shared / Math.max(a.size, b.size);
}

/** Existing folders that look like this production's, best first. */
export function suggestFolders(title: string, candidates: string[], min = 0.5, noise: string[] = []) {
  const skip = new Set(noise.flatMap((n) => [...wordSet(n)]));
  return candidates
    .map((id) => ({ id, score: matchScore(title, id.slice(id.lastIndexOf("/") + 1), skip) }))
    .filter((c) => c.score >= min)
    .sort((x, y) => y.score - x.score);
}
