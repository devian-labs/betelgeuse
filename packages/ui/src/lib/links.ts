import { platform } from "../platform";

/** Project links. Ways to support the project are listed on the website's /sponsor/ page, which can change without a release. */
export const LINKS = {
  repo: "https://github.com/devian-labs/betelgeuse",
  issues: "https://github.com/devian-labs/betelgeuse/issues",
  sponsor: "https://betelgeuse.pro/sponsor/",
  kofi: "https://ko-fi.com/smrutiranjan",
  website: "https://betelgeuse.pro",
  privacy: "https://betelgeuse.pro/privacy/",
  devianlabs: "https://devianlabs.com",
  node: "https://nodejs.org/en/download",
};

export const open = (url: string) => platform().openUrl(url);
