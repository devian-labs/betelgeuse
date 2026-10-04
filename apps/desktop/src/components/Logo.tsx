import logo from "../assets/logo.png";

/** Betelgeuse: a red supergiant with a four-point glint (brand/mark.png). */
export function Logo({ className = "" }: { className?: string }) {
  return <img src={logo} alt="" aria-hidden draggable={false} className={`object-contain scale-[1.3] ${className}`} />;
}
