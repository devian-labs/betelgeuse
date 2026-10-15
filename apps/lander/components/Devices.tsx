import type { ReactNode } from "react";

/** Device mockups drawn in CSS (styles in globals.css), around real screenshots of the app. */

/** A laptop: `children` (usually a Shot) on the screen, and the base under it. */
export function Laptop({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`laptop ${className}`}>
      <div className="laptop-screen">{children}</div>
      <div className="laptop-base" aria-hidden />
    </div>
  );
}

/**
 * A phone showing `/assets/phone-<kind>-<name>-<theme>.jpg`: an iPhone (Dynamic Island) or an
 * Android phone (punch-hole camera). It follows the visitor's light or dark mode unless `theme` pins it.
 */
export function Phone({
  kind,
  name,
  alt,
  theme,
  eager = false,
  className = "",
}: {
  kind: "ios" | "android";
  name: string;
  alt: string;
  theme?: "light" | "dark";
  eager?: boolean;
  className?: string;
}) {
  const src = (t: "light" | "dark") => `/assets/phone-${kind}-${name}-${t}.jpg`;
  return (
    <figure className={`phone phone-${kind} ${className}`}>
      <div className="phone-screen">
        <picture>
          {!theme && <source media="(prefers-color-scheme: dark)" srcSet={src("dark")} />}
          <img src={src(theme ?? "light")} alt={alt} width={786} height={1704} loading={eager ? "eager" : "lazy"} decoding="async" />
        </picture>
        <span className={kind === "ios" ? "phone-island" : "phone-camera"} aria-hidden />
      </div>
    </figure>
  );
}
