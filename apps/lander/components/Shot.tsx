type Crop = { x: number; y: number; zoom: number };

/**
 * A screenshot of the app. It follows the visitor's light or dark mode unless `theme` pins it, and
 * `crop` zooms into a region (x/y are the focus point in percent).
 */
export function Shot({
  name,
  alt,
  eager = false,
  theme,
  crop,
}: {
  name: string;
  alt: string;
  eager?: boolean;
  theme?: "light" | "dark";
  crop?: Crop;
}) {
  const set = (t: "light" | "dark") => `/assets/${name}-${t}-1440.jpg 1440w, /assets/${name}-${t}.jpg 2880w`;
  const sizes = crop ? "(min-width: 1180px) 1200px, 150vw" : "(min-width: 1180px) 1140px, 94vw";
  const fallback = theme ?? "light";
  return (
    <figure className={`shot${crop ? " cropped" : ""}`}>
      <picture>
        {!theme && <source media="(prefers-color-scheme: dark)" srcSet={set("dark")} sizes={sizes} />}
        <img
          src={`/assets/${name}-${fallback}-1440.jpg`}
          srcSet={set(fallback)}
          sizes={sizes}
          alt={alt}
          width={2880}
          height={1800}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          style={crop ? { transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x}% ${crop.y}%` } : undefined}
        />
      </picture>
    </figure>
  );
}
