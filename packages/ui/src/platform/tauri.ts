/** The desktop and phone apps' platform: Tauri's commands, events, dialogs and file access. */
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, message, open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Platform, PlatformKind } from "./index";

export function tauriPlatform(kind: PlatformKind, rest: Pick<Platform, "env" | "updates">): Platform {
  return {
    kind,
    invoke,
    listen: (event, handler) => listen(event, handler),
    openUrl: (url) => openUrl(url).catch(() => void window.open(url, "_blank")),
    confirm: (text, options) => confirm(text, options),
    message: async (text, options) => void (await message(text, options)),
    pickFolder: async (title) => {
      const dir = await open({ directory: true, title });
      return typeof dir === "string" ? dir : null;
    },
    pickImport: async (options) => {
      const picked = await open(options);
      return typeof picked === "string" ? picked : null;
    },
    version: getVersion,
    fileUrl: convertFileSrc,
    watchFullscreen: (changed) => {
      let win: ReturnType<typeof getCurrentWindow>;
      try {
        win = getCurrentWindow();
      } catch {
        return () => {}; // not running inside Tauri
      }
      const check = () => win.isFullscreen().then(changed).catch(() => {});
      void check();
      // Entering or leaving fullscreen resizes the window.
      const unlisten = win.onResized(check).catch(() => () => {});
      return () => void unlisten.then((f) => f());
    },
    features: { agents: kind === "desktop", importer: kind === "desktop", pluginFolders: kind === "desktop", gitRemote: true, windowControls: kind === "desktop" },
    ...rest,
  };
}
