/** Betelgeuse: a red supergiant with a four-point glint (same mark as the app). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id="bg-star" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff4e0" />
          <stop offset="0.4" stopColor="#ffb35c" />
          <stop offset="0.8" stopColor="#e8471c" />
          <stop offset="1" stopColor="#9c1d0c" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill="url(#bg-star)" />
      <path d="M16 3 L17 15 L29 16 L17 17 L16 29 L15 17 L3 16 L15 15 Z" fill="#fff4e0" opacity="0.85" />
    </svg>
  );
}
