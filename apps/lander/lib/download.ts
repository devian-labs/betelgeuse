import type { Asset } from "./github";

export type Device = { os: "macOS" | "Windows" | "Linux" | "Android" | null; arch: "arm" | "x64" | null };

/** Which operating system this is, from what the browser says. iPhones and iPads have no build yet. */
export function osFrom(userAgent: string, platform: string): Device["os"] {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad/i.test(userAgent)) return null;
  const p = `${platform} ${userAgent}`;
  if (/mac/i.test(p)) return "macOS";
  if (/win/i.test(p)) return "Windows";
  if (/linux|x11/i.test(p)) return "Linux";
  return null;
}

/** The file to download for this device, or null when the visitor has to choose. */
export function pickDownload(assets: Asset[], { os, arch }: Device): Asset | null {
  const find = (match: RegExp) => assets.find((a) => match.test(a.name)) ?? null;
  switch (os) {
    // Browsers often won't say which kind of Mac this is. Apple Silicon is the likelier one.
    case "macOS":
      return find(arch === "x64" ? /x64\.dmg$/ : /aarch64\.dmg$/);
    case "Windows":
      return find(/setup\.exe$/);
    case "Linux":
      return find(arch === "arm" ? /aarch64\.AppImage$/ : /amd64\.AppImage$/);
    case "Android":
      return find(/android\.apk$/);
    default:
      return null;
  }
}

/** The processor, where the browser will say. Chrome and Edge tell directly; others may reveal it through the graphics chip. */
async function detectArch(): Promise<Device["arch"]> {
  type Hints = { getHighEntropyValues?: (keys: string[]) => Promise<{ architecture?: string }> };
  const hints = (navigator as Navigator & { userAgentData?: Hints }).userAgentData;
  const architecture = await hints?.getHighEntropyValues?.(["architecture"]).then((v) => v.architecture, () => undefined);
  if (architecture === "arm") return "arm";
  if (architecture === "x86") return "x64";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const renderer = gl?.getParameter(gl.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
    if (typeof renderer === "string") {
      if (/Apple M\d/i.test(renderer)) return "arm";
      if (/Intel|AMD|Radeon/i.test(renderer)) return "x64";
    }
  } catch {
    /* no graphics information: unknown */
  }
  return null;
}

export async function detectDevice(): Promise<Device> {
  const os = osFrom(navigator.userAgent, navigator.platform);
  return { os, arch: os === "macOS" || os === "Linux" ? await detectArch() : null };
}
