/** Betelgeuse: a red supergiant with a four-point glint (brand/mark.png). */
export function Logo({ size = 24 }: { size?: 18 | 22 | 24 | 64 }) {
  // The glow runs past the star, so draw it a little larger than its layout box (sized by class, in globals.css).
  const drawn = Math.round(size * 1.35);
  return (
    <span className={`logo logo-${size}`} aria-hidden>
      <picture>
        <source srcSet="/logo.webp" type="image/webp" />
        <img src="/logo.png" alt="Betelgeuse logo" width={drawn} height={drawn} draggable={false} />
      </picture>
    </span>
  );
}
