/**
 * Productions: rows of a pipeline database, each with a project folder in the library. The pipeline
 * settings are the plugin's workspace data (`.betelgeuse/plugins/media-library/data.json`).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { ctx, usePagesVersion, workspace } from "./host";

/** How productions map to project folders in the library. */
export type Pipeline = {
  /** The pipeline database's page path. */
  database: string | null;
  channelProperty: string;
  folderProperty: string;
  /** Where new project folders go, per channel value: library folder ids. */
  channelFolders: Record<string, string>;
  defaultFolder: string | null;
  template: string[];
};

export const DEFAULT_PIPELINE: Pipeline = {
  database: null,
  channelProperty: "Channel",
  folderProperty: "Project folder",
  channelFolders: {},
  defaultFolder: null,
  template: ["Footage", "Audio", "Graphics", "Project", "Exports", "Thumbnail"],
};

/** A video (or post) in the pipeline database, with the project folder its files live in. */
export type Production = {
  path: string;
  title: string;
  channel: string | null;
  status: string | null;
  /** Library folder id, e.g. `Studio/YouTube/AgileCoder/Vibe Coding`. */
  folder: string | null;
};

// The settings, cached so page panels can decide synchronously whether to show.
let pipeline: Pipeline = DEFAULT_PIPELINE;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export async function loadPipeline() {
  const data = await ctx().storage.workspace.get<{ pipeline: Partial<Pipeline> }>();
  pipeline = { ...DEFAULT_PIPELINE, ...(data.pipeline ?? {}) };
  listeners.forEach((l) => l());
}
export const currentPipeline = () => pipeline;
export const usePipeline = () => useSyncExternalStore(subscribe, () => pipeline);

export async function savePipeline(patch: Partial<Pipeline>) {
  pipeline = { ...pipeline, ...patch };
  listeners.forEach((l) => l());
  await ctx().storage.workspace.update<{ pipeline: Pipeline }>((d) => ({ ...d, pipeline }));
}

const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);

export async function loadProductions(p: Pipeline): Promise<Production[]> {
  if (!p.database) return [];
  const rows = await workspace()
    .databaseRows(p.database)
    .catch(() => []);
  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    channel: text(r.properties[p.channelProperty]) ?? null,
    status: text(r.properties.Status) ?? null,
    folder: text(r.properties[p.folderProperty])?.replace(/\/+$/, "") || null,
  }));
}

/** The pipeline's productions, reloaded when pages change. */
export function useProductions() {
  const p = usePipeline();
  const pages = usePagesVersion();
  const [list, setList] = useState<Production[]>([]);
  useEffect(() => {
    if (!p.database) return setList([]);
    let live = true;
    loadProductions(p).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [p, pages]);
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
export const homeFolder = (p: Pipeline, channel: string | null) => (channel && p.channelFolders[channel]) || p.defaultFolder || null;

/** Words that name the channel rather than the video: the channel value and its folder's path. */
export const channelNoise = (p: Pipeline, channel: string | null) => [channel ?? "", ...(homeFolder(p, channel)?.split("/") ?? [])];

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
