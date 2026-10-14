/**
 * Media Library's link to Betelgeuse: the plugin context, and the few helpers the screens use,
 * all on top of the public plugin API.
 */
import type { MediaLibrary, PluginContext, Workspace } from "@betelgeuse/plugin-api";
import { useEffect, useState } from "react";

let current: PluginContext | null = null;
export const setContext = (c: PluginContext | null) => (current = c);

/** The plugin's context. Only used while the plugin is active (its screens exist only then). */
export function ctx(): PluginContext {
  if (!current) throw new Error("Media Library isn't active");
  return current;
}
export const library = (): MediaLibrary => ctx().library!;
export const workspace = (): Workspace => ctx().workspace!;

/** Bumped whenever pages change on disk, like the app's own refresh key. */
export function usePagesVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const sub = workspace().onChange(() => setV((x) => x + 1));
    return () => sub.dispose();
  }, []);
  return v;
}

export const openPage = (path: string, options?: { newTab?: boolean }) => workspace().openPage(path, options);
export const openLibrary = (options?: { newTab?: boolean }) => ctx().views.open("library", options);
