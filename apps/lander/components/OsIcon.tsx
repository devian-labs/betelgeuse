import type { ReactNode } from "react";

export type Os = "macOS" | "iOS" | "Windows" | "Linux" | "Android" | "Web";

const apple = (
  <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.8 2.3 1.1 0 1.6-.7 2.9-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.3-.9-2.3-3.6zM14.2 5.8c.6-.8 1-1.8.9-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.3z" />
);

const icons: Record<Exclude<Os, "Web">, ReactNode> = {
  macOS: apple,
  iOS: apple,
  Windows: <path d="M3 5.5l7.5-1v7H3zm8.5-1.2L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zm8.5 0H21V21l-9.5-1.3z" />,
  Linux: (
    <>
        {/* Tux: the card's colour shows through for the belly and eyes, so it reads as a penguin at this size. */}
        <path d="M12 1.8c-2.7 0-4.2 2-4.2 4.7 0 1.3-.2 2.2-.9 3.4-1.1 1.8-2.5 3.8-2.5 6.1 0 1.4.5 2.5 1.4 3.1h12.4c.9-.6 1.4-1.7 1.4-3.1 0-2.3-1.4-4.3-2.5-6.1-.7-1.2-.9-2.1-.9-3.4 0-2.7-1.5-4.7-4.2-4.7z" />
        <ellipse cx="12" cy="14.6" rx="3.7" ry="4.5" fill="var(--icon-cut, var(--raised))" />
        <ellipse cx="10.5" cy="6" rx="1.05" ry="1.35" fill="var(--icon-cut, var(--raised))" />
        <ellipse cx="13.5" cy="6" rx="1.05" ry="1.35" fill="var(--icon-cut, var(--raised))" />
        <circle cx="10.8" cy="6.3" r=".5" />
        <circle cx="13.2" cy="6.3" r=".5" />
        <path d="M10.2 8.2 12 7.5l1.8.7-1.8 1.5z" fill="var(--icon-cut, var(--raised))" />
        <path d="M4.8 20.3c0-1 1.3-1.7 2.8-1.7 1.3 0 2.4.8 2.4 1.8 0 .9-1 1.4-2.6 1.4s-2.6-.5-2.6-1.5zM19.2 20.3c0-1-1.3-1.7-2.8-1.7-1.3 0-2.4.8-2.4 1.8 0 .9 1 1.4 2.6 1.4s2.6-.5 2.6-1.5z" />
      </>
  ),
  Android: (
    <path d="M17.5 9.6l1.6-2.8a.4.4 0 0 0-.7-.4l-1.6 2.8a9.8 9.8 0 0 0-7.6 0L7.6 6.4a.4.4 0 0 0-.7.4l1.6 2.8C5.8 11 4 13.6 3.8 16.6h16.4c-.2-3-2-5.6-4.7-7zM8.5 14a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8zm7 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z" />
  ),
};

/** A platform's logo. */
export function OsIcon({ os, size = 24 }: { os: Os; size?: number }) {
  if (os === "Web") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="9.2" />
        <path d="M2.8 12h18.4M12 2.8c2.6 2.5 4 5.7 4 9.2s-1.4 6.7-4 9.2c-2.6-2.5-4-5.7-4-9.2s1.4-6.7 4-9.2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {icons[os]}
    </svg>
  );
}
