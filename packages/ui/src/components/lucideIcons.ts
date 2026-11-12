// Every Lucide icon by name (~1,500), for page icons and the icon picker. Loaded on demand (see
// PageIcon.loadIcons) so the app starts without them.
import { icons as lucide } from "lucide-react";

// Icons Lucide has renamed, kept under their old names so pages saved with them keep their icon.
const RENAMED: Record<string, keyof typeof lucide> = { Music: "EighthNotes", CircleAlert: "CircleExclamationPoint", TriangleAlert: "TriangleExclamationPoint" };

export const icons = { ...lucide, ...Object.fromEntries(Object.entries(RENAMED).map(([old, now]) => [old, lucide[now]])) };
