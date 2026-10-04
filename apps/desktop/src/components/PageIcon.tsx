import { icons, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { api } from "../lib/api";
import { textColor } from "../lib/colors";

/**
 * Page icons, stored as a frontmatter string:
 *   "🚀"                    an emoji
 *   "lucide:Rocket:blue"    a flat icon in one of Notion's colours
 *   ".assets/logo-123.png"  a custom image uploaded into the vault
 *   "https://…/icon.png"    an image link
 */
export type ParsedIcon =
  | { kind: "emoji"; value: string }
  | { kind: "lucide"; name: string; color: string; Component: LucideIcon }
  | { kind: "image"; src: string; local: boolean };

export function parseIcon(icon: string): ParsedIcon {
  if (icon.startsWith("lucide:")) {
    const [, name, color = "default"] = icon.split(":");
    const Component = (icons as Record<string, LucideIcon | undefined>)[name];
    if (Component) return { kind: "lucide", name, color, Component };
  }
  if (icon.startsWith(".assets/")) return { kind: "image", src: icon, local: true };
  if (/^https?:\/\//.test(icon)) return { kind: "image", src: icon, local: false };
  return { kind: "emoji", value: icon };
}

export const lucideIcon = (name: string, color: string) => `lucide:${name}:${color}`;

const assetUrls = new Map<string, Promise<string>>();

/** Loads a vault asset as an object URL, cached for the session. */
export function assetUrl(path: string): Promise<string> {
  let url = assetUrls.get(path);
  if (!url) {
    url = api.readAsset(path).then((buf) => URL.createObjectURL(new Blob([buf])));
    url.catch(() => assetUrls.delete(path));
    assetUrls.set(path, url);
  }
  return url;
}

function AssetImage({ src, local, size }: { src: string; local: boolean; size: number }) {
  const [url, setUrl] = useState(local ? null : src);
  useEffect(() => {
    if (!local) return setUrl(src);
    let alive = true;
    assetUrl(src).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [src, local]);
  const style: CSSProperties = { width: size, height: size };
  return url ? <img src={url} alt="" draggable={false} style={style} className="shrink-0 rounded-[3px] object-cover" /> : <span style={style} className="inline-block shrink-0" />;
}

export function PageIcon({ icon, size = 16, className = "" }: { icon: string; size?: number; className?: string }) {
  const parsed = parseIcon(icon);
  if (parsed.kind === "lucide") {
    const { Component, color } = parsed;
    return <Component size={size} strokeWidth={size > 40 ? 1.5 : 2} className={`shrink-0 ${className}`} style={{ color: textColor(color) ?? "var(--muted)" }} />;
  }
  if (parsed.kind === "image") return <AssetImage src={parsed.src} local={parsed.local} size={size} />;
  return (
    // A line icon only fills ~85% of its box, so emoji are drawn at that size to look the same.
    <span className={`inline-grid shrink-0 place-items-center leading-none ${className}`} style={{ fontSize: Math.round(size * 0.88), width: size, height: size }}>
      {parsed.value}
    </span>
  );
}
