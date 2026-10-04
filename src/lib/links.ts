import { openUrl } from "@tauri-apps/plugin-opener";

/** Project links: change these when the repository and funding pages are set up. */
export const LINKS = {
  repo: "https://github.com/devian-labs/betelgeuse",
  issues: "https://github.com/devian-labs/betelgeuse/issues",
  sponsor: "https://github.com/sponsors/devian-labs",
  kofi: "https://ko-fi.com/devianlabs",
  website: "https://betelgeuse.devianlabs.com",
  node: "https://nodejs.org/en/download",
};

export const open = (url: string) => openUrl(url).catch(() => window.open(url, "_blank"));
