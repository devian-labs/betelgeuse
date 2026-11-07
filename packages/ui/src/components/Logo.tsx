import logo from "../assets/logo.png";

// A bundler gives an image import as a URL (Vite) or as an object holding one (Next.js).
const asset = logo as unknown as string | { src: string };
const src = typeof asset === "string" ? asset : asset.src;

/** Betelgeuse: a red supergiant with a four-point glint (brand/mark.png). */
export function Logo({ className = "" }: { className?: string }) {
  return <img src={src} alt="" aria-hidden draggable={false} className={`object-contain scale-[1.3] ${className}`} />;
}
