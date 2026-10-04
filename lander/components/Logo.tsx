/** Betelgeuse: a red supergiant with a four-point glint (brand/mark.png). */
export function Logo({ size = 28 }: { size?: number }) {
  // The glow runs past the star, so draw it a little larger than its layout box.
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden>
      <img src="/logo.png" alt="" width={size * 1.35} height={size * 1.35} draggable={false} />
    </span>
  );
}
